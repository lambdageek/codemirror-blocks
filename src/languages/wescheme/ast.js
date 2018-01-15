import {ASTNode, pluralize, descDepth} from '../../ast';

export class LetLikeExpr extends ASTNode {
  constructor(from, to, form, bindings, expr, options={}) {
    super(from, to, 'letLikeExpr', options);
    this.form = form;
    this.bindings = bindings;
    this.expr = expr;
    this.pieces = ["(",form,"(",this.bindings,")",this.expr,")"];
  }

  *[Symbol.iterator]() {
    yield this;
    yield this.bindings;
    yield this.expr;
  }

  toDescription(level){
    if((this['aria-level']- level) >= descDepth) return this.options['aria-label'];
    return `a ${this.form} expression with ${pluralize("binding", this.bindings.exprs)}`;
  }
}

export class WhenUnless extends ASTNode {
  constructor(from, to, form, predicate, exprs, options={}) {
    super(from, to, 'whenUnlessExpr', options);
    this.form = form;
    this.predicate = predicate;
    this.exprs = exprs;
    this.pieces = ["(", form, "(", predicate, ")", this.exprs]
  }

  *[Symbol.iterator]() {
    yield this;
    yield this.predicate;
    yield this.exprs;
  }

  toDescription(level){
    if((this['aria-level']- level) >= descDepth) return this.options['aria-label'];
    return `a ${this.form} expression: ${this.form} ${this.predicate.toDescription(level)}, ${this.exprs.toDescription(level)}`;
  }
}