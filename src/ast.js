const uuidv4 = require('uuid/v4');
var jsonpatch = require('fast-json-patch');

function comparePos(a, b) {
  return a.line - b.line || a.ch - b.ch;
}
function posWithinNode(pos, node){
  return (comparePos(node.from, pos) <= 0) && (comparePos(node.to, pos) >= 0);
}

// Cast an object to the appropriate ASTNode, and traverse its children
// REVISIT: should we be using Object.setPrototypeOf() here? And good god, eval()?!?
function castToASTNode(o) {
  if(o.type !== o.constructor.name.toLowerCase()) {
    let desiredType = o.type.charAt(0).toUpperCase() + o.type.slice(1);
    o.__proto__ = eval(desiredType).prototype;              // cast the node itself
    if(o.options.comment) castToASTNode(o.options.comment); // cast the comment, if it exists
  }
  [...o].slice(1).forEach(castToASTNode);                   // traverse children
}

function enumerateList(lst, level) {
  lst = lst.map(l => l.toDescription(level)).slice(0);
  var last = lst.pop();
  return (lst.length == 0)? last : lst.join(', ') + " and "+last;
}

export function pluralize(noun, set) {
  return set.length+' '+noun+(set.length != 1? 's' : '');
}

export const descDepth = 1;


// This is the root of the *Abstract Syntax Tree*.  Parser implementations are
// required to spit out an `AST` instance.
export class AST {
  constructor(rootNodes) {
    // the `rootNodes` attribute simply contains a list of the top level nodes
    // that were parsed.
    this.rootNodes = rootNodes;
    // the `reverseRootNodes` attribute is a shallow, reversed copy of the rootNodes
    this.reverseRootNodes = rootNodes.slice().reverse();

    // the `nodeIdMap` attribute can be used to look up nodes by their id.
    // the other nodeMaps make it easy to determine node order
    this.nodeIdMap = new Map();
    this.nodePathMap = new Map();
    this.nextNodeMap = new WeakMap();
    this.prevNodeMap = new WeakMap();

    this.lastNode = null;
    this.annotateNodes();
  }

  // annotateNodes : ASTNodes ASTNode -> Void
  // walk through the siblings, assigning aria-* attributes
  // and populating various maps for tree navigation
  annotateNodes(nodes=this.rootNodes, parent=false) {
    nodes.forEach((node, i) => {
      node.path = parent? parent.path + (","+i) : i.toString();
      node["aria-setsize"]  = nodes.length;
      node["aria-posinset"] = i+1;
      node["aria-level"]    = 1+(parent? parent.id.split(",").length : 0);
      if (this.lastNode) {
        this.nextNodeMap.set(this.lastNode, node);
        this.prevNodeMap.set(node, this.lastNode);
      }
      this.nodeIdMap.set(node.id, node);
      this.nodePathMap.set(node.path, node);
      this.lastNode = node;
      var children = [...node].slice(1); // the first elt is always the parent
      this.annotateNodes(children, node);
    });
  }


  // patch : AST ChangeObj -> AST
  // given a new AST, return a new one patched from the current one
  // taking care to preserve all rendered DOM elements, though!
  patch(newAST, {from, to, text}) {
    let fromNode      = this.getRootNodesTouching(from, from)[0]; // is there a containing rootNode?
    let fromPos       = fromNode? fromNode.from : from;           // if so, use that node's .from
    var insertedToPos = {line: from.line+text.length-1, ch: text[text.length-1].length+((text.length==1)? from.ch : 0)};
    // get an array of removed roots and inserted roots
    let removedRoots  = this.getRootNodesTouching(from, to);
    let insertedRoots = newAST.getRootNodesTouching(fromPos, insertedToPos).map(r => {r.dirty=true; return r;});
    // compute splice point, do the splice, and patch from/to posns, aria attributes, etc
    for(var i = 0; i<this.rootNodes.length; i++){ if(comparePos(fromPos, this.rootNodes[i].from)<=0) break;  }
    //console.log('starting at index'+(i)+', remove '+removedRoots.length+' roots and insert', insertedRoots);
    this.rootNodes.splice(i, removedRoots.length, ...insertedRoots);
    var patches = jsonpatch.compare(this.rootNodes, newAST.rootNodes);
    // only update aria attributes and position fields
    patches = patches.filter(p => ['aria-level','aria-setsize','aria-posinset','line','ch'].includes(p.path.split('/').pop()));
    jsonpatch.applyPatch(this.rootNodes, patches, false); // false = don't validate patches
    //this.rootNodes.forEach(castToASTNode);
    return new AST(this.rootNodes);
  }

  getNodeById(id) {
    return this.nodeIdMap.get(id);
  }
  getNodeByPath(path) {
    return this.nodePathMap.get(path);
  }

  // return the next node or false
  getNodeAfter(selection) {
    return this.nextNodeMap.get(selection)
        || this.rootNodes.find(node => comparePos(node.from, selection) >= 0)
        || false;
  }
  // return the previous node or false
  getNodeBefore(selection) {
    return this.prevNodeMap.get(selection)
        || this.reverseRootNodes.find(node => comparePos(node.to, selection) <= 0)
        || false;
  }
  // return the node containing the cursor, or false
  getNodeContaining(cursor, nodes = this.rootNodes) {
    let n = nodes.find(node => posWithinNode(cursor, node));
    return n && ([...n].length == 1? n : this.getNodeContaining(cursor, [...n].slice(1)) || n);
  }
  // return all the root nodes that contain the given positions, or fall between them
  getRootNodesTouching(start, end, rootNodes=this.rootNodes){
    return rootNodes.filter(node =>
      posWithinNode(start, node) || posWithinNode(end, node) ||
      ( (comparePos(start, node.from) < 0) && (comparePos(end, node.to) > 0) ));
  }
  // return the parent or false
  getNodeParent(node) {
    let path = node.path.split(",");
    path.pop();
    return this.nodePathMap.get(path.join(",")); 
  }
  // return the first child, if it exists
  getNodeFirstChild(node) {
    return this.nodePathMap.get(node.path+",0");
  }

  getClosestNodeFromPath(keyArray) {
    let path = keyArray.join(',');
    // if we have no valid key, give up
    if(keyArray.length == 0) return false;
    // if we have a valid key, return the node
    if(this.nodePathMap.has(path)) { return this.nodePathMap.get(path); }
    // if not at the 1st sibling, look for a previous one
    else if(keyArray[keyArray.length-1] > 0) { keyArray[keyArray.length-1]--; }
    // if we're at the first child, go up a generation
    else { keyArray.pop(); }
    return this.getClosestNodeFromPath(keyArray);
  }

  // getNextMatchingNode : (ASTNode->ASTNode) (ASTNode->Bool) ASTNode -> ASTNode
  // Consumes a search function, a test function, and a starting ASTNode. 
  // Calls searchFn(Start) over and over until testFn(Node)==true 
  getNextMatchingNode(searchFn, testFn, start) {
    let nextNode = searchFn(start);
    while (nextNode && testFn(nextNode)) {
      nextNode = searchFn(nextNode);
    }
    return nextNode || start;
  }
}

// Every node in the AST inherits from the `ASTNode` class, which is used to
// house some common attributes.
export class ASTNode {
  constructor(from, to, type, options) {

    // The `from` and `to` attributes are objects containing the start and end
    // positions of this node within the source document. They are in the format
    // of `{line: <line>, ch: <column>}`.
    this.from = from;
    this.to = to;

    // Every node has a `type` attribute, which is simply a human readable
    // string sepcifying what type of node it is. This helps with debugging and
    // with writing renderers.
    this.type = type;

    // Every node also has an `options` attribute, which is just an open ended
    // object that you can put whatever you want in it. This is useful if you'd
    // like to persist information from your parser about a particular node, all
    // the way through to the renderer. For example, when parsing wescheme code,
    // human readable aria labels are generated by the parser, stored in the
    // options object, and then rendered in the renderers.
    this.options = options;

    // Every node also has a globally unique `id` which can be used to look up
    // it's corresponding DOM element, or to look it up in `AST.nodeIdMap`
    this.id = uuidv4(); // generate a unique ID

    // every node keeps track of it's "pieces": strings and children that make
    // up the original, textual representation
    this.pieces = [];
  }

  toDescription(){
    return this.options["aria-label"];
  } 

  // toString : void -> String
  // produce the EXACT text representation of the node
  toString() {
    let str = "", {ch, line} = this.from;
    this.pieces.forEach(n => {
      if(n.type){ // if it's an ASTNode, compute \n and " ", and then add the node's string
        n = "\n".repeat(n.from.line-line)+" ".repeat(n.from.ch-(n.from.line==line? ch:0))+n.toString();
      }
      let lines = n.split(/\r\n|\r|\n/), lastLineChs = lines[lines.length-1].length;
      str += n; line += lines.length-1; ch = lastLineChs + (lines.length==1? ch:0);
    });
    if(ch !== this.to.ch || line !== this.to.line) console.warn("toString() measurement error!", str);
    return str;
  }
}

export class Unknown extends ASTNode {
  constructor(from, to, elts, options={}) {
    super(from, to, 'unknown', options);
    this.elts = elts;
    this.pieces = ["(", ...elts, ")"];
  }

  *[Symbol.iterator]() {
    yield this;
    for (let elt of this.elts) {
      yield elt;
    }
  }

  toDescription(level){
    if((this['aria-level']- level) >= descDepth) return this.options['aria-label'];
    return `an unknown expression with ${pluralize("children", this.elts)} `+ 
      this.elts.map((e, i, elts)  => (elts.length>1? (i+1) + ": " : "")+ e.toDescription(level)).join(", ");
  }
}

export class Expression extends ASTNode {
  constructor(from, to, func, args, options={}) {
    super(from, to, 'expression', options);
    this.func = func;
    this.args = args;
    this.pieces = ["(", func, ...args, ")"];
  }

  *[Symbol.iterator]() {
    yield this;
    yield this.func;
    for (let arg of this.args) {
      yield arg;
    }
  }

  toDescription(level){
    // if it's the top level, enumerate the args
    if((this['aria-level'] - level) == 0) { 
      return `applying the function ${this.func.toDescription()} to ${pluralize("argument", this.args)} `+
      this.args.map((a, i, args)  => (args.length>1? (i+1) + ": " : "")+ a.toDescription(level)).join(", ");
    }
    // if we've bottomed out, use the aria label
    if((this['aria-level'] - level) >= descDepth) return this.options['aria-label'];
    // if we're in between, use "f of A, B, C" format
    else return `${this.func.toDescription()} of `+ this.args.map(a  => a.toDescription(level)).join(", ");
      
  }
}

export class IdentifierList extends ASTNode {
  constructor(from, to, kind, ids, options={}) {
    super(from, to, 'identifierList', options);
    this.kind = kind;
    this.ids = ids;
    this.pieces = ids;
  }

  *[Symbol.iterator]() {
    yield this;
    for (let id of this.ids) {
      yield id;
    }
  }

  toDescription(level){
    if((this['aria-level'] - level) >= descDepth) return this.options['aria-label'];
    return enumerateList(this.ids, level);
  }
}

export class StructDefinition extends ASTNode {
  constructor(from, to, name, fields, options={}) {
    super(from, to, 'structDefinition', options);
    this.name = name;
    this.fields = fields;
    this.pieces = ["(define-struct", name, "(", ...fields, ")", ")"];
  }

  *[Symbol.iterator]() {
    yield this;
    yield this.name;
    yield this.fields;
  }

  toDescription(level){
    if((this['aria-level'] - level) >= descDepth) return this.options['aria-label'];
    return `define ${this.name.toDescription(level)} to be a structure with
            ${this.fields.toDescription(level)}`;
  }
}

export class VariableDefinition extends ASTNode {
  constructor(from, to, name, body, options={}) {
    super(from, to, 'variableDefinition', options);
    this.name = name;
    this.body = body;
    this.pieces = ["(define", name, body, ")"];
  }

  toDescription(level){
    if((this['aria-level'] - level) >= descDepth) return this.options['aria-label'];
    let insert = ["literal", "blank"].includes(this.body.type)? "" : "the result of:";
    return `define ${this.name} to be ${insert} ${this.body.toDescription(level)}`;
  }

  *[Symbol.iterator]() {
    yield this;
    yield this.name;
    yield this.body;
  }
}

export class LambdaExpression extends ASTNode {
  constructor(from, to, args, body, options={}) {
    super(from, to, 'lambdaExpression', options);
    this.args = args;
    this.body = body;
    this.pieces = ["(lambda", "(", args, ")", body, ")"];
  }

  *[Symbol.iterator]() {
    yield this;
    yield this.args;
    yield this.body;
  }

  toDescription(level){
    if((this['aria-level'] - level) >= descDepth) return this.options['aria-label'];
    return `an anonymous function of ${pluralize("argument", this.args.ids)}: 
            ${this.args.toDescription(level)}, with body:
            ${this.body.toDescription(level)}`;
  }
}

export class FunctionDefinition extends ASTNode {
  constructor(from, to, name, params, body, options={}) {
    super(from, to, 'functionDefinition', options);
    this.name = name;
    this.params = params;
    this.body = body;
    this.pieces = ["(define", name, "(", params, ")", body, ")"];
  }

  *[Symbol.iterator]() {
    yield this;
    yield this.name;
    yield this.params;
    yield this.body;
  }

  toDescription(level){
    if((this['aria-level'] - level) >= descDepth) return this.options['aria-label'];
    return `define ${this.name} to be a function of 
            ${this.params.toDescription(level)}, with body:
            ${this.body.toDescription(level)}`;
  }
}

export class CondClause extends ASTNode {
  constructor(from, to, testExpr, thenExprs, options={}) {
    super(from, to, 'condClause', options);
    this.testExpr = testExpr;
    this.thenExprs = thenExprs;
    this.pieces = ["[", testExpr, ...thenExprs, "]"];
  }

  *[Symbol.iterator]() {
    yield this;
    yield this.testExpr;
    for(let thenExpr of this.thenExprs) {
      yield thenExpr;
    }
  }

  toDescription(level){
    if((this['aria-level'] - level) >= descDepth) return this.options['aria-label'];
    return `condition: if ${this.testExpr.toDescription(level)}, then, ${this.thenExprs.map(te => te.toDescription(level))}`;
  }
}

export class CondExpression extends ASTNode {
  constructor(from, to, clauses, options={}) {
    super(from, to, 'condExpression', options);
    this.clauses = clauses;
    this.pieces = ["(cond", ...clauses, ")"];
  }

  *[Symbol.iterator]() {
    yield this;
    for (let clause of this.clauses) {
      yield clause;
    }
  }

  toDescription(level){
    if((this['aria-level'] - level) >= descDepth) return this.options['aria-label'];
    return `a conditional expression with ${pluralize("condition", this.clauses)}: 
            ${this.clauses.map(c => c.toDescription(level))}`;
  }
}

export class IfExpression extends ASTNode {
  constructor(from, to, testExpr, thenExpr, elseExpr, options={}) {
    super(from, to, 'ifExpression', options);
    this.testExpr = testExpr;
    this.thenExpr = thenExpr;
    this.elseExpr = elseExpr;
    this.pieces = ["(if", testExpr, thenExpr, elseExpr, ")"];
  }

  *[Symbol.iterator]() {
    yield this;
    yield this.testExpr;
    yield this.thenExpr;
    yield this.elseExpr;
  }

  toDescription(level){
    if((this['aria-level'] - level) >= descDepth) return this.options['aria-label'];
    return `an if expression: if ${this.testExpr.toDescription(level)}, then ${this.thenExpr.toDescription(level)} `+
            `else ${this.elseExpr.toDescription(level)}`;
  }
}

export class Literal extends ASTNode {
  constructor(from, to, value, dataType='unknown', options={}) {
    super(from, to, 'literal', options);
    this.value = value;
    this.dataType = dataType;
  }

  *[Symbol.iterator]() {
    yield this;
  }
  // override with simpler alternative
  toString() { return this.value.toString(); }
}

export class Comment extends ASTNode {
  constructor(from, to, comment, options={}) {
    super(from, to, 'comment', options);
    this.comment = comment;
    this.pieces = ["#|", comment, "|#"];
  }

  *[Symbol.iterator]() {
    yield this;
  }
}

export class Blank extends ASTNode {
  constructor(from, to, value, dataType='blank', options={}) {
    super(from, to, 'blank', options);
    this.value = value || "...";
    this.dataType = dataType;
  }

  *[Symbol.iterator]() {
    yield this;
  }
  // override with simpler alternative
  toString() { return this.value.toString(); }
}

export class Sequence extends ASTNode {
  constructor(from, to, exprs, name, options={}) {
    super(from, to, 'sequence', options);
    this.exprs = exprs;
    this.name = name;
    this.pieces = ["(", name, ...exprs, ")"];
  }

  *[Symbol.iterator]() {
    yield this;
    for (let expr of this.exprs) {
      yield expr;
    }
  }

  toDescription(level) {
    if((this['aria-level'] - level) >= descDepth) return this.options['aria-label'];
    return `a sequence containing ${enumerateList(this.exprs, level)}`;
  }
}