// Browser translation (Chrome / Google Translate on a phone set to another language)
// and some extensions replace the page's text nodes with their own elements. React
// still holds the original nodes, so its next update calls removeChild / insertBefore
// with a node that is no longer there and the whole page stops ("Failed to execute
// 'insertBefore' on 'Node'"). This is the widely used guard from
// https://github.com/facebook/react/issues/11538: when the node has been moved away,
// skip the call instead of throwing. Translation keeps working; at worst a translated
// piece of text is not refreshed until the next render.
let installed = false;

export function installDomGuards() {
  if (installed || typeof Node !== "function" || !Node.prototype) return;
  installed = true;

  const originalRemoveChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function removeChild(child) {
    if (child && child.parentNode !== this) return child;
    return originalRemoveChild.call(this, child);
  };

  const originalInsertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function insertBefore(newNode, referenceNode) {
    if (referenceNode && referenceNode.parentNode !== this) return newNode;
    return originalInsertBefore.call(this, newNode, referenceNode);
  };
}
