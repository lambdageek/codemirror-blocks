import {ASTNode} from '../../ast';

export class Conditional extends ASTNode {
  constructor(from, to, condStatement, thenStatement, elseStatement, options={}) {
    super(from, to, 'conditional', options);
    this.condStatement = condStatement;
    this.thenStatement = thenStatement;
    this.elseStatement = elseStatement;
    this.pieces = ["if (", this.condStatement, ") {",this.thenStatement,"}"];
    if(this.elseStatement) { this.pieces.push(" else {", this.body, "}")};
  }

  *[Symbol.iterator]() {
    yield this;
    for (let node of this.condStatement) {
      yield node;
    }
    for (let node of this.thenStatement) {
      yield node;
    }
    if (this.elseStatement) {
      for (let node of this.elseStatement) {
        yield node;
      }
    }
  }
}

//TODO: add a toString() method
export class Assignment extends ASTNode {
  constructor(from, to, operator, left, right, options={}) {
    super(from, to, 'assignment', options);
    this.operator = operator;
    this.left = left;
    this.right = right;
  }

  *[Symbol.iterator]() {
    yield this;
    for (let node of this.left) {
      yield node;
    }
    for (let node of this.right) {
      yield node;
    }
  }
}

//is it possible to merge this somehow with assign class? Almost identical with it
export class Binary extends ASTNode {
  constructor(from, to, operator, left, right, options={}) {
    super(from, to, 'binary', options);
    this.operator = operator;
    this.left = left;
    this.right = right;
    this.pieces = [left, operator, right];
  }

  *[Symbol.iterator]() {
    yield this;
    for (let node of this.left) {
      yield node;
    }
    for (let node of this.right) {
      yield node;
    }
  }
}

//use struct toString method as template for this toString() method?
export class Prog extends ASTNode {
  constructor(from, to, prog, options={}) {
    super(from, to, 'prog', options);
    this.prog = prog;
    this.pieces = [prog];
  }

  *[Symbol.iterator]() {
    yield this;
    for (let node of this.prog) {
      yield node;
    }
  }
}

export class Let extends ASTNode {
  constructor(from, to, vars, body, options={}) {
    super(from, to, 'let', options);
    this.vars = vars;
    this.body = body;
    this.pieces = [vars, body];
  }

  *[Symbol.iterator]() {
    yield this;
    for (let node of this.vars) {
      yield node;
    }
    //why does body not need a for loop to be iterated over
    yield this.body;
  }
}
