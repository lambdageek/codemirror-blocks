import 'babel-polyfill';
import CodeMirror from 'codemirror';
import 'codemirror/lib/codemirror.css';
import 'codemirror/theme/monokai.css';
import 'codemirror/addon/search/searchcursor.js';
import CodeMirrorBlocks from '../src/blocks';
import '../src/languages/wescheme';

require('./example-page.less');

var cm = CodeMirror.fromTextArea(
  document.getElementById("code"),
  { theme:'3024-day',
    lineNumbers: true,
    autoCloseBrackets: true,
    viewportMargin: 10}
);

var cm2 = CodeMirror.fromTextArea(
  document.getElementById('code2'),
  { theme:'3024-day',
    autoCloseBrackets: false,
    lineNumbers: true,
    viewportMargin: 10,
    extraKeys: {
      "Shift-9" : function(cm) {
        cm.replaceSelection("(...)");
      }
    }
 }
);

//var code = require('./ast-test.rkt');
var code = require('./space-invaders.rkt');
//var code = "(sum (+   (- 1 2)  3)\n (*  3  4)\n (/ 5 6))\n(product 5 6 7)"
cm.setValue(code);
cm.doc.clearHistory();
cm2.swapDoc(cm.getDoc().linkedDoc({sharedHist: true}));

const options = {
  willInsertNode(sourceNodeText, sourceNode, destination) {
    let line = cm2.getLine(destination.line);
    let prev = line[destination.ch - 1] || '\n';
    let next = line[destination.ch] || '\n';
    sourceNodeText = sourceNodeText.trim();
    if (!/\s|[\(\[\{]/.test(prev)) {
      sourceNodeText = ' ' + sourceNodeText;
    }
    if (!/\s|[\)\]\}]/.test(next)) {
      sourceNodeText += ' ';
    }
    return sourceNodeText;
  }
};
var blocks = new CodeMirrorBlocks(cm2, 'wescheme', options);

document.getElementById('mode').onchange = function(e){ blocks.setBlockMode(e.target.checked); };