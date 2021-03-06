import { 
  keywords, 
  TokenEnumList,
  kMaxAscii, 
  precedence_, 
  kIsIdentifierPart, 
  kIsIdentifierStart,
  kIsWhiteSpace,
  kIsWhiteSpaceOrLineTerminator,
  kTerminatesLiteral,
  kCannotBeKeyword,
  kCannotBeKeywordStart,
  kStringTerminator,
  kIdentifierNeedsSlowPath,
  kMultilineCommentCharacterNeedsSlowPath,
  TokenMapping,
} from "../enum";
import { IsKeywordBits, IsPropertyNameBits } from "./BitField";

/**
 * 判断给定字符(数字)是否在两个字符的范围内
 * C++通过static_cast同时处理了char和int类型 JS就比较坑了
 * 这个方法其实在C++超简单的 然而用JS直接炸裂
 * @param {Enumerator} c 目标字符
 * @param {Enumerator} lower_limit 低位字符
 * @param {Enumerator} higher_limit 高位字符
 */
export const IsInRange = (c, lower_limit, higher_limit) => {
  if (typeof lower_limit === 'string' && typeof higher_limit === 'string') {
    lower_limit = lower_limit.charCodeAt();
    higher_limit = higher_limit.charCodeAt();
  }
  if (typeof c === 'string') c = c.charCodeAt();
  return (c >= lower_limit) && (c <= higher_limit);
}

/**
 * 将大写字母转换为小写字母
 */
export const AsciiAlphaToLower = (c) => {
  // if (typeof c !== 'number') c = c.charCodeAt();
  // return String.fromCharCode(c | 0x20);
  if(typeof c !== 'string') return c | 0x20;
  return c.toLowerCase();
}


/**
 * 数字类型判断
 */
const IMPLICIT_OCTAL = 0;
const BINARY = 1;
const OCTAL = 2;
const HEX = 3;
const DECIMAL = 4;
const DECIMAL_WITH_LEADING_ZERO = 5;
// 二进制 0~1
export const IsBinaryDigit = (c) => {
  return IsInRange(c, '0', '1');
}
// 八进制 0~7
export const IsOctalDigit = (c) => {
  return IsInRange(c, '0', '7');
}
// 十进制 0~9
export const IsDecimalDigit = (c) => {
  return IsInRange(c, '0', '9');
}
// 十六进制 0~f
export const IsHexDigit = (c) => {
  return IsDecimalDigit(c) || IsInRange(AsciiAlphaToLower(c), 'a', 'f');
}
// 隐式非八进制 8~9
export const  IsNonOctalDecimalDigit = (c) => {
  return IsInRange(c, '8', '9');
}
// 是否是十进制
export const IsDecimalNumberKind = (kind) => {
  return IsInRange(kind, DECIMAL, DECIMAL_WITH_LEADING_ZERO)
}
// 是否是合法的bigint进制模式
export const IsValidBigIntKind = (kind) => {
  return IsInRange(kind, BINARY, DECIMAL);
}

/**
 * 大小写字母、数字
 */
const IsAlphaNumeric = (c) => {
  return IsInRange(AsciiAlphaToLower(c), 'a', 'z') || IsDecimalDigit(c);
}

/**
 * Ascii - Unicode值映射
 */
let UnicodeToAsciiMapping = [];

for(let i = 0;i < kMaxAscii;i ++) {
  UnicodeToAsciiMapping.push(String.fromCharCode(i));
}
export { UnicodeToAsciiMapping }

/**
 * 判断是否是合法标识符字符
 * 没有char类型真的坑
 */
export const IsAsciiIdentifier = (c) => {
  if (typeof c === 'number' && c > 9) c = UnicodeToAsciiMapping[c];
  return IsAlphaNumeric(c) || c === '$' || c === '_';
}
export const IsIdentifierStart = (c) => {
  if (typeof c === 'number') c = UnicodeToAsciiMapping[c];
  return ('A' <= c && c <= 'Z') || ('a' <= c && c <= 'z') || c === '_';
}
export const IsUppercase = (c) => 'A' <= c && c <= 'Z';

/**
 * 判断token是否在给定范围内
 * @param {Enumerator} token 目标Token
 * @param {Enumerator} lower_limit 低位
 * @param {Enumerator} higher_limit 高位
 */
export const TokenIsInRange = (token, lower_limit, higher_limit) => {
  lower_limit = TokenEnumList.indexOf(lower_limit);
  higher_limit = TokenEnumList.indexOf(higher_limit);
  token = TokenEnumList.indexOf(token.slice(7));
  return IsInRange(token, lower_limit, higher_limit);
}

/**
 * 源码用的递归 比较迷
 * 逻辑如下 反正相当于JS的includes
 */
const IsInString = (tar, c, i = 0) => {
  // return i >= tar.length ? false : tar[i] === c ? true : IsInString(tar, c, i + 1);
  return tar.includes(c);
}

/**
 * 源码确实是一个超长的三元表达式
 * Token是一个枚举 这里直接用字符串代替了
 * 因为太多了 只保留几个看看
 */
const TokenToAsciiMapping = (c) => {
  return c === '(' ? 'Token::LPAREN' : 
  c === ')' ? 'Token::RPAREN' :
  c === '{' ? 'Token::LBRACE' :
  c === '}' ? 'Token::RBRACE' :
  c === '[' ? 'Token::LBRACK' :
  c === ']' ? 'Token::RBRACK' :
  c === '?' ? 'Token::CONDITIONAL' :
  c === ':' ? 'Token::COLON' :
  c === ';' ? 'Token::SEMICOLON' :
  c === ',' ? 'Token::COMMA' :
  c === '.' ? 'Token::PERIOD' :
  c === '|' ? 'Token::BIT_OR' :
  c === '&' ? 'Token::BIT_AND' :
  c === '^' ? 'Token::BIT_XOR' :
  c === '~' ? 'Token::BIT_NOT' :
  c === '!' ? 'Token::NOT' :
  c === '<' ? 'Token::LT' :
  c === '>' ? 'Token::GT' :
  c === '%' ? 'Token::MOD' :
  c === '=' ? 'Token::ASSIGN' :
  c === '+' ? 'Token::ADD' :
  c === '-' ? 'Token::SUB' :
  c === '*' ? 'Token::MUL' :
  c === '/' ? 'Token::DIV' :
  c === '#' ? 'Token::PRIVATE_NAME' :
  c === '"' ? 'Token::STRING' :
  c === '\'' ? 'Token::STRING' :
  c === '`' ? 'Token::TEMPLATE_SPAN' :
  c === '\\' ? 'Token::IDENTIFIER' :
  c === ' ' ? 'Token::WHITESPACE' :
  c === '\t' ? 'Token::WHITESPACE' :
  c === '\v' ? 'Token::WHITESPACE' :
  c === '\f' ? 'Token::WHITESPACE' :
  c === '\r' ? 'Token::WHITESPACE' :
  c === '\n' ? 'Token::WHITESPACE' :
  IsDecimalDigit(c) ? 'Token::NUMBER' :
  IsAsciiIdentifier(c) ? 'Token::IDENTIFIER' :
  'Token::ILLEGAL'
};
export const UnicodeToToken = UnicodeToAsciiMapping.map(c => TokenToAsciiMapping(c));

/**
 * bitmap判断flag系列2
 */
const BuildAsciiCharFlags = (c) => {
  return ((IsAsciiIdentifier(c) || c === '\\') ? 
  (kIsIdentifierPart | (IsDecimalDigit(c) ? kIsIdentifierStart : 0)) : 0) | 
  ((c === ' ' || c === '\t' || c === '\v' || c === '\f') ?
  (kIsWhiteSpace | kIsWhiteSpaceOrLineTerminator) : 0) | 
  ((c === '\r' || c=== '\n') ? kIsWhiteSpaceOrLineTerminator : 0);
}
const kAsciiCharFlags = UnicodeToAsciiMapping.map(c => BuildAsciiCharFlags(c));
export const IsWhiteSpaceOrLineTerminator = (c) => {
  if(typeof c !== 'number') c = c.charCodeAt();
  // if (!IsInRange(c, 0, 127)) return IsWhiteSpaceOrLineTerminatorSlow(c);
  return kAsciiCharFlags[c] & kIsWhiteSpaceOrLineTerminator;
}

//
export function IsLineTerminator(c) {
  return c == 0x000A || c == 0x000D || c == 0x2028 || c == 0x2029;
}

/**
 * 首字符直接用上面那个对象的key做判断
 * 源码用的宏 懒得去模拟了(也基本上没法模拟)
 */
export const IsKeywordStart = (c) => {
  return Object.keys(keywords).includes(c);
}

/**
 * v8用宏将所有关键词串起来 弄成一个超长字符串
 * 然后判断字符是否在这个字符串中
 */
const keywordLongString = Object.values(keywords).reduce((cur ,tar) => cur.concat(tar), []).map(v => v.value).join('');
export const CanBeKeywordCharacter = (c) => {
  return IsInString(keywordLongString, c);
}

/**
 * 返回单个字符类型标记
 */
const GetScanFlags = (c) => {
  return (!IsAsciiIdentifier(c) ? kTerminatesLiteral : 0) |
  ((IsAsciiIdentifier(c) && !CanBeKeywordCharacter(c)) ? kCannotBeKeyword : 0) |
  (IsKeywordStart(c) ? kCannotBeKeywordStart : 0) |
  ((c === '\'' || c === '"' || c === '\n' || c === '\r' || c === '\\') ? kStringTerminator : 0) |
  (c === '\\' ? kIdentifierNeedsSlowPath : 0) |
  (c === '\n' || c === '\r' || c === '*' ? kMultilineCommentCharacterNeedsSlowPath : 0)
}

export const character_scan_flags = UnicodeToAsciiMapping.map(c => GetScanFlags(c));

/**
 * 判断当前表达式的层级或符号优先级
 * 根据token返回一个precedence值
 * @param {Enumerator} token 枚举值
 * @param {Boolean} accept_IN 
 * @returns {Number} precedence
 */
export const Precedence = (token, accept_IN) => {
  let idx = TokenEnumList.indexOf(token.slice(7));
  return precedence_[Number(accept_IN)][idx];
}

/**
 * 枚举已经无法再模拟了 JS真香
 * @param {Enumerator} token "Token::xxx"
 */
export const IsAnyIdentifier = (token) => {
  return TokenIsInRange(token, 'IDENTIFIER', 'ESCAPED_STRICT_RESERVED_WORD');
}

/**
 * bitmap判断flag系列
 */
export const TerminatesLiteral = (scan_flags) => {
  return scan_flags & kTerminatesLiteral;
}
export const IdentifierNeedsSlowPath = (scan_flags) => {
  return scan_flags & kIdentifierNeedsSlowPath;
}
export const CanBeKeyword = (scan_flags) => {
  return scan_flags & kCannotBeKeyword;
}

/**
 * 枚举key分为两种
 * 一种是关键词 一种是符号
 */
const token_flags = TokenMapping.map(o => {
  let key = o.key;
  if (key && IsInRange(key[0], 'a', 'z')) return (IsKeywordBits.encode(1) | IsPropertyNameBits.encode(1));
  return IsPropertyNameBits.encode(Number(IsAnyIdentifier(`Token::${o.token}`)));
});

export const IsPropertyName = (token) => {
  let idx = TokenEnumList.findIndex(v => v === token.slice(7));
  // return token_flags[idx];
  return IsPropertyNameBits.decode(token_flags[idx]);
}