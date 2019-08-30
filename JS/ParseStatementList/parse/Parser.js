import { 
  Expression,
  AstNodeFactory
} from '../ast/Ast';
import { DeclarationParsingResult, Declaration } from './DeclarationParsingResult';
import AstValueFactory from '../ast/AstValueFactory';
import Location from '../base/Location';

import { VariableDeclarationParsingScope } from './ExpressionScope';
import Scope from './Scope';
import { FuncNameInferrer, State } from './FuncNameInferrer';

import {
  kVar,
  kLet,
  kConst,

  NORMAL_VARIABLE,
  PARAMETER_VARIABLE,
  THIS_VARIABLE,
  SLOPPY_BLOCK_FUNCTION_VARIABLE,
  SLOPPY_FUNCTION_NAME_VARIABLE,
} from '../base/Const';

import {
  IsAnyIdentifier,
  IsLexicalVariableMode,
} from '../base/Util';

import {
  kParamDupe,
  kVarRedeclaration,
} from '../base/MessageTemplate';

const kStatementListItem = 0;
const kStatement = 1;
const kForStatement = 2;

const kNoSourcePosition = -1;

const kYes = 0;
const kNo = 1;

const kNeedsInitialization = 0;
const kCreatedInitialized = 1;

const kSloppyModeBlockScopedFunctionRedefinition = 22;
const kUseCounterFeatureCount = 76;

class ParserBase {
  constructor(scanner) {
    // scanner.Initialize();
    this.scanner = scanner;
    this.ast_value_factory_ = new AstValueFactory();
    this.ast_node_factory_ = new AstNodeFactory();
    this.scope_ = new Scope();
    this.fni_ = new FuncNameInferrer();
    this.expression_scope_ = null;
  }
  IsLet(identifier) { return identifier === this.ast_value_factory_.let_string(); }
  UNREACHABLE() {
    this.scanner.UNREACHABLE();
  }
  peek() {
    return this.scanner.peek();
  }
  Next() {
    return this.scanner.Next();
  }
  PeekAhead() {
    return this.scanner.PeekAhead();
  }
  PeekInOrOf() {
    return this.peek() === 'Token::IN'
    //  || PeekContextualKeyword(ast_value_factory()->of_string());
  }
  position() {
    return this.scanner.location().beg_pos;
  }
  peek_position() {
    return this.scanner.peek_location().beg_pos;
  }
  end_position() {
    return this.scanner.location().end_pos;
  }
  Consume(token) {
    let next = this.scanner.Next();
    return next === token;
  }
  Check(token) {
    let next = this.scanner.peek();
    if (next === token) {
      this.Consume(next);
      return true;
    }
    return false;
  }
  ParseStatementList() {
    while(this.peek() !== 'Token::EOS') {
      this.ParseStatementListItem();
    }
  }
  ParseStatementListItem() {
    switch(this.peek()) {
      case 'Token::LET':
        if (this.IsNextLetKeyword()) {
          return this.ParseVariableStatement(kStatementListItem, null);
        }
        break;
    }
  }
  /**
   * 处理var、let、const声明语句
   * 语句的形式应该是 (var | const | let) (Identifier) (=) (AssignmentExpression)
   */
  IsNextLetKeyword() {
    /**
     * 这里调用了PeekAhead 会影响Next方法
     * 调用后cur,next,next_next的值变化如下
     * [null, LET, null] => [null, LET, IDENTIFIER];
     */
    let next_next = this.PeekAhead();
    /**
     * let后面跟{、}、a、static、let、yield、await、get、set、async是合法的(至少目前是合法的)
     * 其他保留关键词合法性根据严格模式决定
     */
    switch(next_next) {
      case 'Token::LBRACE':
      case 'Token::LBRACK':
      case 'Token::IDENTIFIER':
      case 'Token::STATIC':
      case 'Token::LET':
      case 'Token::YIELD':
      case 'Token::AWAIT':
      case 'Token::GET':
      case 'Token::SET':
      case 'Token::ASYNC':
        return true;
      case 'Token::FUTURE_STRICT_RESERVED_WORD':
        // return is_sloppy(language_mode());
      default:
        return false;
    }
  }
  ParseVariableStatement(var_context, names) {
    let parsing_result = new DeclarationParsingResult();
    this.ParseVariableDeclarations(var_context, parsing_result, names);
    // this.ExpectSemicolon();
  }
  ParseVariableDeclarations(var_context, parsing_result, names) {
    parsing_result.descriptor.kind = NORMAL_VARIABLE;
    parsing_result.descriptor.declaration_pos = this.peek_position();
    parsing_result.descriptor.initialization_pos = this.peek_position();
    /**
     * 这里调用了Consume 变动了游标
     * [null, LET, IDENTIFIER] => [LET, IDENTIFIER, null]
     * 返回了LET
     */
    switch(this.peek()) {
      case 'Token::VAR':
        parsing_result.descriptor.mode = kVar;
        this.Consume('Token::VAR');
        break;
      case 'Token::CONST':
        this.Consume('Token::CONST');
        parsing_result.descriptor.mode = kConst;
        break;
      case 'Token::LET':
        this.Consume('Token::LET');
        parsing_result.descriptor.mode = kLet;
        break;
      default:
        this.UNREACHABLE();
        break;
    }
    /**
     * 源码中该变量类型是 ZonePtrList<const AstRawString>* names
     * 由于传进来是一个nullptr 这里手动重置为数组
     */
    if (!names) names = [];
    // 这一步的目的是设置scope参数
    this.expression_scope_ = new VariableDeclarationParsingScope(this, parsing_result.descriptor.mode, names);
    // 获取合适的作用域
    let target_scope = IsLexicalVariableMode(parsing_result.descriptor.mode) ? this.scope_ : this.scope_.GetDeclarationScope();
    // TODO
    let declaration_it = target_scope.declarations().end();

    let bindings_start = this.peek_position();
    /**
     * 可以一次性声明多个变量
     * let a = 1, b, c;
     */
    do {
      let fni_state = new State(this.fni_);

      let decl_pos = this.peek_position();
      // 变量名 => AstRawString*
      let name = null;
      // 抽象语法树节点 => Expression*
      let pattern = null;
      // 检查下一个token是否是标识符
      if (IsAnyIdentifier(this.peek())) {
        /**
         * 解析变量名字符串
         * 这里调用了Next 会对sanner的游标进行调证
         * [LET, IDENTIFIER, null] => [IDENTIFIER, ASSIGN, null]
         * 返回IDENTIFIER
         */
        name = this.ParseAndClassifyIdentifier(this.Next());
        // 检查下一个token是否是赋值运算符
        if (this.peek() === 'Token::ASSIGN' || 
        // for in、for of
        (var_context === kForStatement && this.PeekInOrOf()) ||
        parsing_result.descriptor.mode === kLet) {
          /**
           * @returns {Expression}
           * 过程总结如下：
           * 1、生成一个VariableProxy实例(继承于Expressio) 
           * 该类负责管理VariableDeclaration 并记录了变量是否被赋值、是否被使用等等
           * 2、生成一个VariableDeclaration实例(继承于AstNode)
           * 该类管理Variable 并描述了变量的位置、声明类型(变量、参数、表达式)等
           * 3、在合适的Scope中生成一个Variable实例 插入到Map中
           * 该类描述了变量的作用域、名称等等
           * 
           * 整个过程有如下细节
           * (1)有两种情况下 该声明会被标记为unresolved丢进一个容器
           * 第一是赋值右值为复杂表达式 复杂表达式需要重新走Parse的完整解析
           * 例如let a = '123'.split('').map(v => v ** 2);
           * 第二种情况是var类型的声明 由于需要向上搜索合适的作用域 声明需要后置处理
           * (2)let、const与var生成的AstNode类型不一致 var属于NestedVariable
           * (3)有一个作用域链 类似于原型链 从里向外通过outer_scope属性连着
           * (4)var类型的声明会向上一直搜索is_declaration_scope_为1的作用域
           * (5)生成Variable后 const声明会被标记必须被立即赋值
           */
          pattern = this.ExpressionFromIdentifier(name, decl_pos);
        } else {
          // 声明未定义的语句 let a;
          this.DeclareIdentifier(name, decl_pos);
          pattern = this.NullExpression();
        }
      } else {
        // 声明未定义的语句
        name = this.NullIdentifier();
        pattern = this.ParseBindingPattern();
      }

      let variable_loc = new Location();

      let value = this.NullExpression();
      let value_beg_pos = kNoSourcePosition;
      /**
       * 这里的Check调用了Scanner.Next()方法
       * [IDENTIFIER, ASSIGN, null] => [ASSIGN, SMI, null]
       */
      if (this.Check('Token::ASSIGN')) {
        {
          value_beg_pos = this.peek_position();
          /**
           * 这里处理赋值
           * 大部分情况下这是一个右值 从简到繁(源码使用了一个Precedence来处理各类情况)如下
           * (1)单值字面量 null、true、false、1、1.1、1n、'1'
           * (2)一元运算 +1、++a 形如+function(){}、!function(){}会被特殊处理
           * (3)二元运算 'a' + 'b'、1 + 2
           * (4){}对象、[]数组、``模板字符串
           * 等等情况 实在太过繁琐
           * 除了上述情况 被赋值的可能也是一个左值 比如遇到如下的特殊Token
           * import、async、new、this、function、任意标识符(分为普通变量与箭头函数)等等
           * 由于左值的解析相当于一个完整的新表达式 因此不必列举出来
           */
          value = this.ParseAssignmentExpression();
        }
        variable_loc.end_pos = this.end_position();

        /**
         * 处理a = function(){};
         * 下面的先不管
         */
      }
      // 处理for in、for of
      else {}

      let initializer_position = this.end_position();
      // 当成简单的遍历
      let declaration_end = target_scope.declarations().end();
      for(;declaration_it !== declaration_end;declaration_it = declaration_it.next_) {
        declaration_it.var().set_initializer_position(initializer_position);
      }

      let decl = new Declaration(pattern, value);
      decl.value_beg_pos = value_beg_pos;

      parsing_result.declarations.push(decl);
    } while (this.Check('Token::COMMA'));

    parsing_result.bindings_loc = new Location(bindings_start, this.end_position());
  }
  ParseAndClassifyIdentifier(next) {
    if (IsAnyIdentifier(next, 'IDENTIFIER', 'ASYNC')) {
      let name = this.GetIdentifier();
      return name;
    }
    // 其他情况都是用保留词做变量名 不合法
    this.UNREACHABLE();
  }
  GetIdentifier() {
    return this.GetSymbol();
  }
  /**
   * 返回AstRawString*
   */
  GetSymbol() {
    const result = this.scanner.CurrentSymbol(this.ast_value_factory_);
    return result;
  }
  // NewRawVariable(name, pos) {
  //   return this.ast_node_factory_.NewVariableProxy(name, NORMAL_VARIABLE, pos);
  // }
}

/**
 * 源码中的impl 作为模板参数传入ParseBase 同时也继承于该类
 * class Parser : public ParserBase<Parser>
 * Parser、ParserBase基本上是一个类
 */
export default class Parser extends ParserBase {
  constructor(scanner) {
    super(scanner);
    this.fni_ = new FuncNameInferrer();
    this.use_counts_ = new Array(kUseCounterFeatureCount).fill(0);
  }
  // 源码返回一个空指针
  NullExpression() {
    return new Expression();
  }
  /**
   * 返回一个变量代理 继承于Expression类
   * @returns {VariableProxy}
   */
  ExpressionFromIdentifier(name, start_position, infer = kYes) {
    // 这个fni_暂时不知道干啥的
    if (infer === kYes) {
      this.fni_.PushVariableName(name);
    }
    // 在当前的作用域下生成一个新的变量
    return this.expression_scope_.NewVariable(name, start_position);
  }
  DeclareIdentifier(name, start_position) {
    return this.expression_scope_.Declare(name, start_position);
  }
  DeclareVariable(name, kind, mode, init, scope, was_added, begin, end = kNoSourcePosition) {
    let declaration;
    // var声明的变量需要提升
    if (mode === kVar && !scope.is_declaration_scope()) {
      declaration = this.ast_node_factory_.NewNestedVariableDeclaration(scope, begin);
    }
    /**
     * let、const 声明
     * 这里才是返回一个VariableDeclaration实例
     * 即new VariableDeclaration(begin)
     */
    else {
      declaration = this.ast_node_factory_.NewVariableDeclaration(begin);
    }
    this.Declare(declaration, name, kind, mode, init. scope, was_added. begin, end);
    return declaration.var();
  }
  Declare(declaration, name, variable_kind, mode, init, scope, was_added, var_begin_pos, var_end_pos) {
    // 这两个参数作为引用传入方法 JS只能用这个操作了
    // bool local_ok = true;
    // bool sloppy_mode_block_scope_function_redefinition = false;
    // 普通模式下 在作用域内容重定义
    let { local_ok, sloppy_mode_block_scope_function_redefinition } = scope.DeclareVariable(
      declaration, name, var_begin_pos, mode, variable_kind, init, was_added,
      false, true);
    // 下面代码大部分情况不会走
    if (!local_ok) {
      // 标记错误地点 end未传入时仅仅高亮start一个字符
      let loc = new Location(var_begin_pos, var_end_pos !== kNoSourcePosition ? var_end_pos : var_begin_pos + 1);
      if (variable_kind === PARAMETER_VARIABLE) throw new Error(loc, kParamDupe);
      else throw new Error(loc, kVarRedeclaration);
    }
    // 重定义计数
    else if (sloppy_mode_block_scope_function_redefinition) {
      ++this.use_counts_[kSloppyModeBlockScopedFunctionRedefinition];
    }
  }
}