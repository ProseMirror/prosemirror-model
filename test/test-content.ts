import {ContentMatch, Node} from "prosemirror-model"
import {schema, eq, doc, p, pre, img, br, h1, hr} from "prosemirror-test-builder"
import ist from "ist"

function get(expr: string) { return ContentMatch.parse(expr, schema.nodes) }

function match(expr: string, types: string) {
  let m = get(expr), ts = types ? types.split(" ").map(t => schema.nodes[t]) : []
  for (let i = 0; m && i < ts.length; i++) m = m.matchType(ts[i])!
  return m && m.validEnd
}

function valid(expr: string, types: string) { ist(match(expr, types)) }
function invalid(expr: string, types: string) { ist(!match(expr, types)) }

function fill(expr: string, before: Node, after: Node, result: Node | null) {
  let filled = get(expr).matchFragment(before.content)!.fillBefore(after.content, true)
  if (result) ist(filled, result.content, eq)
  else ist(!filled)
}

function fill3(expr: string, before: Node, mid: Node, after: Node, left: Node | null, right?: Node) {
  let content = get(expr)
  let a = content.matchFragment(before.content)!.fillBefore(mid.content)
  let b = a && content.matchFragment(before.content.append(a).append(mid.content))!.fillBefore(after.content, true)
  if (left) {
    ist(a, left.content, eq)
    ist(b, right!.content, eq)
  } else {
    ist(!b)
  }
}

describe("ContentMatch", () => {
  describe("matchType", () => {
    it("accepts empty content for the empty expr", () => valid("", ""))
    it("doesn't accept content in the empty expr", () => invalid("", "image"))

    it("matches nothing to an asterisk", () => valid("image*", ""))
    it("matches one element to an asterisk", () => valid("image*", "image"))
    it("matches multiple elements to an asterisk", () => valid("image*", "image image image image"))
    it("only matches appropriate elements to an asterisk", () => invalid("image*", "image text"))

    it("matches group members to a group", () => valid("inline*", "image text"))
    it("doesn't match non-members to a group", () => invalid("inline*", "paragraph"))
    it("matches an element to a choice expression", () => valid("(paragraph | heading)", "paragraph"))
    it("doesn't match unmentioned elements to a choice expr", () => invalid("(paragraph | heading)", "image"))

    it("matches a simple sequence", () => valid("paragraph horizontal_rule paragraph", "paragraph horizontal_rule paragraph"))
    it("fails when a sequence is too long", () => invalid("paragraph horizontal_rule", "paragraph horizontal_rule paragraph"))
    it("fails when a sequence is too short", () => invalid("paragraph horizontal_rule paragraph", "paragraph horizontal_rule"))
    it("fails when a sequence starts incorrectly", () => invalid("paragraph horizontal_rule", "horizontal_rule paragraph horizontal_rule"))

    it("accepts a sequence asterisk matching zero elements", () => valid("heading paragraph*", "heading"))
    it("accepts a sequence asterisk matching multiple elts", () => valid("heading paragraph*", "heading paragraph paragraph"))
    it("accepts a sequence plus matching one element", () => valid("heading paragraph+", "heading paragraph"))
    it("accepts a sequence plus matching multiple elts", () => valid("heading paragraph+", "heading paragraph paragraph"))
    it("fails when a sequence plus has no elements", () => invalid("heading paragraph+", "heading"))
    it("fails when a sequence plus misses its start", () => invalid("heading paragraph+", "paragraph paragraph"))

    it("accepts an optional element being present", () => valid("image?", "image"))
    it("accepts an optional element being missing", () => valid("image?", ""))
    it("fails when an optional element is present twice", () => invalid("image?", "image image"))

    it("accepts a nested repeat", () =>
       valid("(heading paragraph+)+", "heading paragraph heading paragraph paragraph"))
    it("fails on extra input after a nested repeat", () =>
       invalid("(heading paragraph+)+", "heading paragraph heading paragraph paragraph horizontal_rule"))

    it("accepts a matching count", () => valid("hard_break{2}", "hard_break hard_break"))
    it("rejects a count that comes up short", () => invalid("hard_break{2}", "hard_break"))
    it("rejects a count that has too many elements", () => invalid("hard_break{2}", "hard_break hard_break hard_break"))
    it("accepts a count on the lower bound", () => valid("hard_break{2, 4}", "hard_break hard_break"))
    it("accepts a count on the upper bound", () => valid("hard_break{2, 4}", "hard_break hard_break hard_break hard_break"))
    it("accepts a count between the bounds", () => valid("hard_break{2, 4}", "hard_break hard_break hard_break"))
    it("rejects a sequence with too few elements", () => invalid("hard_break{2, 4}", "hard_break"))
    it("rejects a sequence with too many elements",
       () => invalid("hard_break{2, 4}", "hard_break hard_break hard_break hard_break hard_break"))
    it("rejects a sequence with a bad element after it", () => invalid("hard_break{2, 4} text*", "hard_break hard_break image"))
    it("accepts a sequence with a matching element after it", () => valid("hard_break{2, 4} image?", "hard_break hard_break image"))
    it("accepts an open range", () => valid("hard_break{2,}", "hard_break hard_break"))
    it("accepts an open range matching many", () => valid("hard_break{2,}", "hard_break hard_break hard_break hard_break"))
    it("rejects an open range with too few elements", () => invalid("hard_break{2,}", "hard_break"))
  })

  describe("fillBefore", () => {
    it("returns the empty fragment when things match", () =>
       fill("paragraph horizontal_rule paragraph", doc(p(), hr()), doc(p()), doc()))

    it("adds a node when necessary", () =>
       fill("paragraph horizontal_rule paragraph", doc(p()), doc(p()), doc(hr())))

    it("accepts an asterisk across the bound", () => fill("hard_break*", p(br()), p(br()), p()))

    it("accepts an asterisk only on the left", () => fill("hard_break*", p(br()), p(), p()))

    it("accepts an asterisk only on the right", () => fill("hard_break*", p(), p(br()), p()))

    it("accepts an asterisk with no elements", () => fill("hard_break*", p(), p(), p()))

    it("accepts a plus across the bound", () => fill("hard_break+", p(br()), p(br()), p()))

    it("adds an element for a content-less plus", () => fill("hard_break+", p(), p(), p(br())))

    it("fails for a mismatched plus", () => fill("hard_break+", p(), p(img()), null))

    it("accepts asterisk with content on both sides", () => fill("heading* paragraph*", doc(h1()), doc(p()), doc()))

    it("accepts asterisk with no content after", () => fill("heading* paragraph*", doc(h1()), doc(), doc()))

    it("accepts plus with content on both sides", () => fill("heading+ paragraph+", doc(h1()), doc(p()), doc()))

    it("accepts plus with no content after", () => fill("heading+ paragraph+", doc(h1()), doc(), doc(p())))

    it("adds elements to match a count", () => fill("hard_break{3}", p(br()), p(br()), p(br())))

    it("fails when there are too many elements", () => fill("hard_break{3}", p(br(), br()), p(br(), br()), null))

    it("adds elements for two counted groups", () => fill("code_block{2} paragraph{2}", doc(pre()), doc(p()), doc(pre(), p())))

    it("doesn't include optional elements", () => fill("heading paragraph? horizontal_rule", doc(h1()), doc(), doc(hr())))

    it("completes a sequence", () =>
       fill3("paragraph horizontal_rule paragraph horizontal_rule paragraph",
             doc(p()), doc(p()), doc(p()), doc(hr()), doc(hr())))

    it("accepts plus across two bounds", () =>
       fill3("code_block+ paragraph+",
             doc(pre()), doc(pre()), doc(p()), doc(), doc()))

    it("fills a plus from empty input", () =>
       fill3("code_block+ paragraph+",
             doc(), doc(), doc(), doc(), doc(pre(), p())))

    it("completes a count", () =>
       fill3("code_block{3} paragraph{3}",
             doc(pre()), doc(p()), doc(), doc(pre(), pre()), doc(p(), p())))

    it("fails on non-matching elements", () =>
       fill3("paragraph*", doc(p()), doc(pre()), doc(p()), null))

    it("completes a plus across two bounds", () =>
       fill3("paragraph{4}", doc(p()), doc(p()), doc(p()), doc(), doc(p())))

    it("refuses to complete an overflown count across two bounds", () =>
       fill3("paragraph{2}", doc(p()), doc(p()), doc(p()), null))
  })
})
