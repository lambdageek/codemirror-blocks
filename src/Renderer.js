import React, {Component} from 'react';
import ReactDOM from 'react-dom';

import Expression       from './components/Expression';
import IfExpression     from './components/IfExpression';
import LambdaExpression from './components/LambdaExpression';
import CondExpression   from './components/CondExpression';
import CondClause       from './components/CondClause';
import Unknown          from './components/Unknown';
import Literal          from './components/Literal';
import Blank            from './components/Blank';
import Comment          from './components/Comment';
import IdentifierList   from './components/IdentifierList';
import StructDefinition from './components/StructDef';
import VariableDefinition from './components/VariableDef';
import FunctionDefinition from './components/FunctionDef';
import Sequence         from './components/Sequence';

function comparePos(a, b) {
  return a.line - b.line || a.ch - b.ch;
}

export default class Renderer {
  constructor(cm, {lockNodesOfType=[], extraRenderers, printASTNode} = {}) {
    this.cm = cm;
    this.lockNodesOfType = lockNodesOfType;
    this.extraRenderers = extraRenderers || {};
    this.printASTNode = printASTNode || (node => node.toString());
    this.nodeRenderers = {
      unknown: Unknown,
      expression: Expression,
      functionDefinition: FunctionDefinition,
      lambdaExpression: LambdaExpression,
      variableDefinition: VariableDefinition,
      identifierList : IdentifierList,
      ifExpression: IfExpression,
      condExpression: CondExpression,
      condClause: CondClause,
      structDefinition: StructDefinition,
      literal: Literal,
      comment: Comment,
      sequence: Sequence,
      blank: Blank,
    };
  }

  // make code "float" between text/blocks
  animateTransition(ast, toBlocks) {
    let start = Date.now();
    let that = this;
    // take note of the parent elt, CM offsets, and rootNodes
    let cm = this.cm, parent = this.cm.getScrollerElement(), rootNodes = ast.rootNodes;
    let parentScrollTop = parent.scrollTop, parentScrollLeft = parent.scrollLeft;
    let lines = parent.getElementsByClassName("CodeMirror-lines")[0];
    let {left: offsetLeft, top: offsetTop} = parent.getBoundingClientRect();
    let cloneParent = parent.appendChild(document.createElement("div"));
    cloneParent.id="clones";

    // toDom : AST Node -> DOM Node
    // given a node AST node, make a DOM node with the same text contents
    var toDom = (node) => {
      let el = document.createElement("span");
      el.className = !["literal", "blank"].includes(node.type)? 'box' : 'literal';
      el.appendChild(document.createTextNode(this.printASTNode(node)));
      return el;
    };

    // given nodes, clones, whether we're in text or block mode, and whether it's a precalc..
    // position the clones over the currently-rendered literals and blanks
    // unless the node is offscreen, in which case fade out the clone
    // uses the FLIP method described at:
    // https://medium.com/outsystems-experts/flip-your-60-fps-animations-flip-em-good-372281598865
    function assignClonePosition(nodes, clones, textPosition, precalc, shiftY=0) {
      var top, left, width, height;
      clones.forEach((clone, i) => {
        let node = nodes[i];
        // compute position in raw CM text - avoid DOM by using cm.charCoords
        if(textPosition) {
          let startCoord = cm.charCoords(node.from, "window"), endCoord = cm.charCoords(node.to, "window");
          top = startCoord.top, left = startCoord.left, width = endCoord.right-left, height = endCoord.bottom-top;
        // compute position of offscreen block - just fadeout and disappear during transition
        } else if(node.el.offsetWidth === 0 && node.el.offsetHeight === 0) {
          clone.classList.add("fadeout");
          return;
        // compute position of onscreen block - use DOM because there's no cheaper way
        } else {
          ({left, top, width, height} = node.el.getBoundingClientRect());
        }
        top  = (top  - offsetTop)  + parentScrollTop;
        left = (left - offsetLeft) + parentScrollLeft;
        if(precalc){ // pre-compute left, top, width and height
          node.top = top; node.left = left; node.width = width; node.height = height;
        } else {     // compute the GPU-accelerated transition
          clone.style.top    = top    + "px";
          clone.style.left   = left   + "px";
          clone.style.transform = 'translate('+(node.left-left)+'px,'+(node.top+shiftY-top)+'px) ';
        }
      });
    }

    // extract all the literals and blanks from a rootNode
    function flatten(flat, node) {
      return ["literal", "blank"].includes(node.type)? flat.concat([node])  // nothing inside literals and blanks
        : that.lockNodesOfType.includes(node.type)? flat.concat([node])     // Perf: don't bother looking inside
          : [...node].slice(1).reduce(flatten, flat);                       // look inside
    }

    // 1) Limit the number of lines CM is rendering (perf), and extract visible nodes, & make clones 
    let originalViewportMargin = that.cm.getOption("viewportMargin");
    that.cm.setOption("viewportMargin", toBlocks? 2 : 20); // blocks are bigger than text, so use a smaller viewport
    let {from, to} = that.cm.getViewport();
    let viewportNodes = ast.getRootNodesTouching({line: from, ch: 0}, {line: to, ch: 0});
    let literals = viewportNodes.reduce(flatten, []), clones = literals.map(toDom);

    // 2) pre-calculate starting positions (F)
    assignClonePosition(literals, clones, toBlocks, true);
    let startScroll = that.cm.getScrollInfo().top, topLine = cm.lineAtHeight(startScroll ,"local");
    let startRoot = rootNodes.find(r => topLine < r.from.line) || rootNodes[0];
    let canary = startRoot? startRoot.from : {line:0,ch:0}, startY = cm.cursorCoords(canary, "local").top;

    // 3) render or clear the original AST
    let renderStart = Date.now();
    lines.classList.add('fadein');
    if(toBlocks) { viewportNodes.forEach(r => this.render(r));           }
    else { cm.getAllMarks().filter(m => m.node).forEach(m => m.clear()); }
    let renderTime = (Date.now() - renderStart)/1000;

    // 4) move each clone to the ending position (L), compute transformation (I), and start animation (P) 
    assignClonePosition(literals, clones, !toBlocks, false, shiftY);
    clones.forEach(c => cloneParent.appendChild(c));
    let shiftY = cm.cursorCoords(canary, "local").top - startY; // how much did the canary line scroll?
    cm.scrollTo(null, startScroll+shiftY);
    setTimeout(() => cloneParent.classList.add("animate", toBlocks? "blocks" : "text"), 50);

    // 5) Clean up after ourselves. The 1500ms should match the transition length defined in blocks.less
    setTimeout(() => {
      lines.classList.remove('fadein');
      cloneParent.remove();
      cm.refresh();
    }, 1500);
    that.cm.setOption("viewportMargin", originalViewportMargin);
    let totalTime = (Date.now() - start)/1000;
    console.log('starting animation took: '+totalTime+ 'ms.\n'
      +renderTime+'ms ('+((renderTime/totalTime)*100).toFixed(2)+'%) of that was for Rendering '+viewportNodes.length+' roots');

    if(toBlocks) { // if going to blockMode, render out-of-viewport nodes while animation is happening
      let alreadyRendered = new Set(viewportNodes);
      rootNodes.forEach(r => {if(!alreadyRendered.has(r)) this.render(r); }); 
    }
  }

  // Render the node, recycling a container whenever possible
  render(node, quarantine=false) {
    var container = document.createElement('span');
    if(node["aria-level"] && node["aria-level"] > 1) { // render in-place 
      container = document.createElement('span');
      node.el.parentNode.replaceChild(container, node.el);                // REVISIT: there *has* to be a better way
      ReactDOM.render(this.renderNodeForReact(node), container);          // REVISIT
      container.parentNode.replaceChild(container.firstChild, container); // REVISIT
    } else { // if it's a root node, reset the marker but save the container
      container.className = 'react-container';
      // find a marker that (a) has an old ASTNode and (b) start in exactly the same place as the new ASTNode
      let marker = this.cm.findMarksAt(node.from).filter(
        m => m.node && !comparePos(m.node.from, node.from))[0]; // there will never be more than one
      // if there IS a marker, we're not quarantining, and it starts at the exact same place..
      if(marker && !quarantine) marker.clear();
      this.cm.markText(node.from, node.to, {replacedWith: container, node: node} );
      
      // REVISIT: make comments disappear by adding an empty span
      if(node.options.comment) {
        this.cm.markText(node.options.comment.from, node.options.comment.to,
          { replacedWith: document.createElement('span') });
      }
      ReactDOM.render(this.renderNodeForReact(node), container);
    }
    return container;
  }

  renderNodeForReact = (node, key) => {
    this.renderNodeForReact.defaultProps = { displayName: 'ASTNode Renderer' };
    var Renderer = this.extraRenderers[node.type] || this.nodeRenderers[node.type];
    if (Renderer === undefined) {
      throw new Error("Don't know how to render node of type: "+node.type);
    }
    if (Renderer && Renderer.prototype instanceof Component) {
      return (
        <Renderer
          node        = {node}
          helpers     = {{renderNodeForReact: this.renderNodeForReact}}
          key         = {key}
          lockedTypes = {this.lockNodesOfType}
        />
      );
    } else {
      throw new Error("Don't know how to render node of type: "+node.type);
    }
  }
}
