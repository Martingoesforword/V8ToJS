export default class RegisterInfo {
  constructor(reg, equivalence_id, materialized, allocated) {
    this.register_ = reg;
    this.equivalence_id_ = equivalence_id;
    this.materialized_ = materialized;
    this.allocated_ = allocated;
    this.needs_flush_ = false;
    this.next_ = this;
    this.prev_ = this;
  }
  GetEquivalentToMaterialize() {
    let visitor = this.next_;
    let best_info = null;
    while(visitor !== this) {
      if (visitor.materialized_) {
        return null;
      }
      if (visitor.allocated_ && (best_info === null || visitor.register_ < best_info.register_)) {
        best_info = visitor;
      }
      visitor = visitor.next_;
    }
    return best_info;
  }
  GetMaterializedEquivalent() {
    let visitor = this;
    do {
      if (visitor.materialized_) {
        return visitor;
      }
      visitor = visitor.next_;
    } while (visitor !== this);

    return null;
  }
  GetMaterializedEquivalentOtherThan(reg) {
    let visitor = this;
    do {
      if (visitor.materialized_ && visitor.register_ !== reg) {
        return visitor;
      }
      visitor = visitor.next_;
    } while (visitor !== this);

    return null;
  }
  GetEquivalent() {
    return this.next_;
  }
  IsInSameEquivalenceSet(info) {
    return this.equivalence_id_ === info.equivalence_id_;
  }
  AddToEquivalenceSetOf(info) {
    this.next_.prev_ = this.prev_;
    this.prev_.next_ = this.next_;

    this.next_ = info.next_;
    this.prev_ = info;
    this.prev_.next_ = this;
    this.next_.prev_ = this;
    this.equivalence_id_ = info.equivalence_id_;
    this.materialized_ = false;
  }
  /**
   * 相当于链表的去除节点
   */
  MoveToNewEquivalenceSet(equivalence_id, materialized) {
    this.next_.prev_ = this.prev_;
    this.prev_.next_ = this.next_;
    this.next_ = this;
    this.prev_ = this;
    this.equivalence_id_ = equivalence_id;
    this.materialized_ = materialized;
  }
}