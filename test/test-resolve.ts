import {doc, p, em, blockquote} from "prosemirror-test-builder"
import ist from "ist"

const testDoc = doc(p("ab"), blockquote(p(em("cd"), "ef")))
const _doc = {node: testDoc, start: 0, end: 12}
const _p1 = {node: testDoc.child(0), start: 1, end: 3}
const _blk = {node: testDoc.child(1), start: 5, end: 11}
const _p2 = {node: _blk.node.child(0), start: 6, end: 10}

describe("Node", () => {
  describe("resolve", () => {
    it("should reflect the document structure", () => {
      let expected: {[pos: number]: any} = {
        0: [_doc, 0, null, _p1.node],
        1: [_doc, _p1, 0, null, "ab"],
        2: [_doc, _p1, 1, "a", "b"],
        3: [_doc, _p1, 2, "ab", null],
        4: [_doc, 4, _p1.node, _blk.node],
        5: [_doc, _blk, 0, null, _p2.node],
        6: [_doc, _blk, _p2, 0, null, "cd"],
        7: [_doc, _blk, _p2, 1, "c", "d"],
        8: [_doc, _blk, _p2, 2, "cd", "ef"],
        9: [_doc, _blk, _p2, 3, "e", "f"],
        10: [_doc, _blk, _p2, 4, "ef", null],
        11: [_doc, _blk, 6, _p2.node, null],
        12: [_doc, 12, _blk.node, null]
      }

      for (let pos = 0; pos <= testDoc.content.size; pos++) {
        let $pos = testDoc.resolve(pos), exp = expected[pos]
        ist($pos.depth, exp.length - 4)
        for (let i = 0; i < exp.length - 3; i++) {
          ist($pos.node(i).eq(exp[i].node))
          ist($pos.start(i), exp[i].start)
          ist($pos.end(i), exp[i].end)
          if (i) {
            ist($pos.before(i), exp[i].start - 1)
            ist($pos.after(i), exp[i].end + 1)
          }
        }
        ist($pos.parentOffset, exp[exp.length - 3])
        let before = $pos.nodeBefore!, eBefore = exp[exp.length - 2]
        ist(typeof eBefore == "string" ? before.textContent : before, eBefore)
        let after = $pos.nodeAfter!, eAfter = exp[exp.length - 1]
        ist(typeof eAfter == "string" ? after.textContent : after, eAfter)
      }
    })

    it("has a working posAtIndex method", () => {
      let d = doc(blockquote(p("one"), blockquote(p("two ", em("three")), p("four"))))
      let pThree = d.resolve(12) // Start of em("three")
      ist(pThree.posAtIndex(0), 8)
      ist(pThree.posAtIndex(1), 12)
      ist(pThree.posAtIndex(2), 17)
      ist(pThree.posAtIndex(0, 2), 7)
      ist(pThree.posAtIndex(1, 2), 18)
      ist(pThree.posAtIndex(2, 2), 24)
      ist(pThree.posAtIndex(0, 1), 1)
      ist(pThree.posAtIndex(1, 1), 6)
      ist(pThree.posAtIndex(2, 1), 25)
      ist(pThree.posAtIndex(0, 0), 0)
      ist(pThree.posAtIndex(1, 0), 26)
    })
  })
})
