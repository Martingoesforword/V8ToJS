import { 
  Bytecode_kIllegal, 
  Bytecode_kReturn, 
  AccumulatorUse_kWrite, 
  OperandScale_kSingle,
  OperandSize_kNone,
  OperandSize_kByte,
  OperandSize_kShort,
  OperandSize_kQuad,
  Bytecode_kThrow,
  Bytecode_kReThrow,
  Bytecode_kAbort,
  Bytecode_kJump,
  Bytecode_kJumpConstant,
  Bytecode_kSuspendGenerator,
} from "../enum";
import { FLAG_ignition_elide_noneffectful_bytecodes } from "../Compiler/Flag";
import { 
  Bytecodes_IsAccumulatorLoadWithoutEffects, 
  Bytecodes_OperandScaleToPrefixBytecode,
  Bytecodes_GetOperandSizes,
} from "../util/Bytecode";
import SourcePosition from './SourcePosition';

export default class BytecodeArrayWriter {
  constructor(constant_array_builder, source_position_mode) {
    // bytecodes_.reserve(512)
    this.bytecodes_ = [];
    this.unbound_jumps_ = 0;
    this.source_position_table_builder_ = source_position_mode;
    this.constant_array_builder_ = constant_array_builder;
    this.last_bytecode_ = Bytecode_kIllegal;
    this.last_bytecode_offset_ = 0;
    this.last_bytecode_had_source_info_ = false;
    this.elide_noneffectful_bytecodes_ = FLAG_ignition_elide_noneffectful_bytecodes;
    this.exit_seen_in_block_ = false;
  }
  Write(node) {
    if (this.exit_seen_in_block_) return;
    this.UpdateExitSeenInBlock(node.bytecodes_);
    this.MaybeElideLastBytecode(node.bytecodes_, node.source_info_.is_valid());

    this.UpdateSourcePositionTable(node);
    this.EmitBytecode(node);
  }
  UpdateExitSeenInBlock(bytecode) {
    switch (bytecode) {
      case Bytecode_kReturn:
      case Bytecode_kThrow:
      case Bytecode_kReThrow:
      case Bytecode_kAbort:
      case Bytecode_kJump:
      case Bytecode_kJumpConstant:
      case Bytecode_kSuspendGenerator:
        this.exit_seen_in_block_ = true;
        break;
      default:
        break;
    }
  }
  MaybeElideLastBytecode(next_bytecode, has_source_info) {
    if (!this.elide_noneffectful_bytecodes_) return;

    if (Bytecodes_IsAccumulatorLoadWithoutEffects(this.last_bytecode_) &&
    next_bytecode === AccumulatorUse_kWrite &&
    (!this.last_bytecode_had_source_info_ || !has_source_info)) {
      // bytecodes()->resize(last_bytecode_offset_) 对JS无意义
      has_source_info |= this.last_bytecode_had_source_info_;
    }
    this.last_bytecode_ = next_bytecode;
    this.last_bytecode_had_source_info_ = has_source_info;
    this.last_bytecode_offset_ = this.bytecodes_.length;
  }
  UpdateSourcePositionTable(node) {
    let bytecode_offset = this.bytecodes_.length;
    let source_info = node.source_info_;
    if (source_info.is_valid()) {
      this.source_position_table_builder_.AddPosition(
        bytecode_offset, new SourcePosition(source_info.source_position_, source_info.is_statement()));
    }
  }
  EmitBytecode(node) {
    let bytecode = node.bytecode_;
    let operand_scale = node.operand_scale_;

    if (operand_scale !== OperandScale_kSingle) {
      let prefix = Bytecodes_OperandScaleToPrefixBytecode(operand_scale);
      this.bytecodes_.push(prefix);
    }
    this.bytecodes_.push(bytecode);

    const operands = node.operands_;
    const operand_count = node.operand_count_;
    const operand_sizes = Bytecodes_GetOperandSizes(bytecode, operand_scale);
    for (let i = 0; i < operand_count; ++i) {
      switch(operand_sizes[i]) {
        case OperandSize_kNone:
          throw new Error('UNREACHABLE');
          break;
        case OperandSize_kByte:
          this.bytecodes_.push(operands[i]);
          break;
        case OperandSize_kShort: {
          let operand = operands[i];
          this.bytecodes_.push(operand[0]);
          this.bytecodes_.push(operand[1]);
          break;
        }
        case OperandSize_kQuad: {
          let raw_operand = operands[i];
          this.bytecodes_.push(raw_operand[0]);
          this.bytecodes_.push(raw_operand[1]);
          this.bytecodes_.push(raw_operand[2]);
          this.bytecodes_.push(raw_operand[3]);
          break;
        }
      }
    }
  }
}