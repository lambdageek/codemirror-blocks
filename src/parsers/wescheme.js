import {
  AST,
  Expression,
  Literal,
  StructDefinition,
  FunctionDefinition,
  ValueDefinition,
  Comment
} from '../ast';

try {
  var lex = require('wescheme-js/src/lex').lex;
  var parse = require('wescheme-js/src/parser').parse;
  var types = require('wescheme-js/src/runtime/types');
  var structures = require('wescheme-js/src/structures');
}  catch (e) {
  console.error('wescheme-js, which is required to use the wescheme blocks parser, does not appear to be installed.', e);
}

function expressionAria(func, argCount) {
  let aria = `${func} expression, ${argCount} argument`;
  if (argCount != 1) {
    aria += 's';
  }
  return aria;
}

function parseNode(node) {
  var from = {
    line: node.location.startRow - 1,
    ch: node.location.startCol
  };
  var to = {
    line: node.location.endRow - 1,
    ch: node.location.endCol
  };

  if (node instanceof structures.callExpr) {
    return new Expression(
      from,
      to,
      parseNode(node.func),
      node.args.map(parseNode).filter(item => item !== null),
      {'aria-label': expressionAria(node.func.stx, node.args.length)}
    );
  } else if (node instanceof structures.andExpr) {
    return new Expression(
      from,
      to,
      new Literal(
        //TODO: don't guess where the and symbol is, need to parse it here.
        {line:from.line, ch:from.ch+1},
        {line:from.line, ch:from.ch+4},
        "and",
        "symbol"
      ),
      node.exprs.map(parseNode).filter(item => item !== null),
      {'aria-label': expressionAria('and', node.exprs.length)}
    );
  } else if (node instanceof structures.orExpr) {
    return new Expression(
      from,
      to,
      new Literal(
        //TODO: don't guess where the or symbol is, need to parse it here.
        {line:from.line, ch:from.ch+1},
        {line:from.line, ch:from.ch+3},
        "or",
        "symbol"
      ),
      node.exprs.map(parseNode).filter(item => item !== null),
      {'aria-label': expressionAria('or', node.exprs.length)}
    );
  } else if (node instanceof structures.defVar) {
    return new ValueDefinition(
      from,
      to,
      node.name.stx, 
      parseNode(node.expr),
      {'read-only' : true}
    );
  } else if (node instanceof structures.defStruct) {
    return new StructDefinition(
      from,
      to,
      node.name.stx,
      node.fields.map(parseNode).filter(item => item != null),
      {'read-only' : true}
    );
  } else if (node instanceof structures.defFunc) {
    return new FunctionDefinition(
      from,
      to,
      node.name.stx,
      node.args.map(symbolNode => symbolNode.stx),
      parseNode(node.body),
      {'read-only' : true}
    );
  } else if (node instanceof structures.symbolExpr) {
    return new Literal(from, to, node.stx, "symbol", {'aria-label':node.stx});
  } else if (node instanceof structures.literal) {
    var dataType = typeof node.val;
    let aria = node.toString();
    if (types.isString(node.val)) {
      dataType = "string";
      aria = `string ${node.val}`;
    } else if (types.isChar(node.val)) {
      dataType = "char";
    } else if (node.val === types.FALSE || node.val === types.TRUE) {
      dataType = "boolean";
    }
    return new Literal(from, to, node, dataType, {'aria-label':aria});
  } else if (node instanceof structures.comment) {
    return new Comment(from, to, node.txt);
  }
  console.log("!! No translator for", node);
  return null;
}

class Parser {

  parse(code) {
    var ast = parse(lex(code, 'foo'));
    var rootNodes = ast.map(parseNode).filter(item => item !== null);
    return new AST(rootNodes);
  }

  // take 2009 WeScheme's highly-irregular structured error messages,
  // and try to extract a readable text-only error message from them
  getExceptionMessage(e){
    var msg = JSON.parse(e)['dom-message'][2].slice(2);
    return (msg.every((element) => typeof element==="string"))? msg 
            : (msg[0] instanceof Array)? msg[0][2].substring(msg[0][2].indexOf("read: ")+6)
            : "Check your quotation marks, or any other symbols you've used";
  }
}

if (lex) {
  module.exports = Parser;
} else {
  module.exports = function() {
    throw new Error('wescheme-js must be installed to use the wescheme blocks parser');
  };
}
