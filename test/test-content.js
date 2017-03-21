const {ContentExpr} = require("../dist/content")
const {schema, eq, doc, p, pre, img, br, h1, h2, em, hr} = require("prosemirror-test-builder")
const ist = require("ist")

function get(expr) { return ContentExpr.parse(schema.nodes.heading, expr, schema.spec.nodes) }

function val(value) { return value.attr ? "." + value.attr : value }

function simplify(elt) {
  let attrs = null
  if (elt.attrs) {
    attrs = {}
    for (let attr in elt.attrs) attrs[attr] = val(elt.attrs[attr])
  }
  return {types: elt.nodeTypes.map(t => t.name).sort(),
          attrs: attrs,
          marks: Array.isArray(elt.marks) ? elt.marks.map(m => m.name) : elt.marks,
          min: val(elt.min), max: elt.max == 2e9 ? Infinity : val(elt.max)}
}

function normalize(obj) {
  return {types: obj.types.sort(),
          attrs: obj.attrs || null,
          marks: obj.marks || false,
          min: obj.min == null ? 1 : obj.min,
          max: obj.max == null ? 1 : obj.max}
}

describe("ContentExpr", () => {
  describe("parse", () => {
    function parse(expr, ...expected) {
      ist(JSON.stringify(get(expr).elements.map(simplify)),
          JSON.stringify(expected.map(normalize)))
    }

    it("parses a plain name", () => parse("paragraph", {types: ["paragraph"]}))

    it("parses a sequence", () => parse("heading paragraph heading",
                                        {types: ["heading"]},
                                        {types: ["paragraph"]},
                                        {types: ["heading"]}))

    it("recognizes the plus sign", () => parse("paragraph+", {types: ["paragraph"], max: Infinity}))

    it("recognizes the asterisk", () => parse("paragraph*", {types: ["paragraph"], min: 0, max: Infinity}))

    it("recognizes the question mark", () => parse("paragraph?", {types: ["paragraph"], min: 0, max: 1}))

    it("accepts a string attribute", () =>
       parse("image[title=\"foo\"]*", {types: ["image"], attrs: {title: "foo"}, min: 0, max: Infinity}))

    it("accepts a numeric attribute", () =>
       parse("heading[level=2]*", {types: ["heading"], attrs: {level: 2}, min: 0, max: Infinity}))

    it("accepts multiple attributes", () =>
       parse("image[title=\"foo\", href=\"bar\"]*",
             {types: ["image"], attrs: {title: "foo", href: "bar"}, min: 0, max: Infinity}))

    it("accepts an attribute referring to a parent attribute", () =>
       parse("heading[level=.level]*",
             {types: ["heading"], attrs: {level: ".level"}, min: 0, max: Infinity}))

    it("accepts undescore syntax for marks", () =>
       parse("hard_break<_>", {types: ["hard_break"], marks: true}))

    it("accepts syntax for specific marks", () =>
       parse("hard_break<strong em>", {types: ["hard_break"], marks: ["strong", "em"]}))

    it("recognizes the pipe operator", () =>
       parse("(hard_break | text | image)", {types: ["text", "image", "hard_break"]}))

    it("can apply a plus sign to a group", () =>
       parse("(hard_break | text | image)+",
             {types: ["text", "image", "hard_break"], max: Infinity}))

    it("understands groups", () =>
       parse("inline*", {types: ["image", "text", "hard_break"], min: 0, max: Infinity}))

    it("accepts braces to specify a count", () =>
       parse("paragraph{2}", {types: ["paragraph"], min: 2, max: 2}))

    it("accepts lower and upper bounds on count", () =>
       parse("paragraph{2, 5}", {types: ["paragraph"], min: 2, max: 5}))

    it("accepts an open range", () =>
       parse("paragraph{2,}", {types: ["paragraph"], min: 2, max: Infinity}))

    it("accepts a count based on an attribute", () =>
       parse("paragraph{.level}", {types: ["paragraph"], min: ".level", max: ".level"}))

    function noParse(expr) {
      ist.throws(() => get(expr))
    }

    it("fails on an invalid character", () => noParse("paragraph/image"))

    it("doesn't allow identical adjacent groups", () => noParse("paragraph? paragraph"))

    it("doesn't allow overlapping adjacent groups", () => noParse("inline image"))

    it("doesn't allow non-existent attributes", () => noParse("hard_break{.foo}"))

    it("doesn't allow non-existent nodes", () => noParse("foo+"))

    it("doesn't allow non-existent marks", () => noParse("hard_break<bar>"))

    it("disallows all marks plus a specific mark", () => noParse("image<_ em>"))

    it("errors on trailing noise", () => noParse("hard_break+ text* ."))

    it("doesn't allow a group to occur zero times", () => noParse("image{0}"))
  })

  const attrs = {level: 3}

  describe("matches", () => {
    function valid(expr, frag) { ist(get(expr).matches(attrs, frag.content)) }
    function invalid(expr, frag) { ist(!get(expr).matches(attrs, frag.content)) }

    it("accepts empty content for the empty expr", () => valid("", p()))
    it("doesn't accept content in the empty expr", () => invalid("", p(img)))

    it("matches nothing to an asterisk", () => valid("image*", p()))
    it("matches one element to an asterisk", () => valid("image*", p(img)))
    it("matches multiple elements to an asterisk", () => valid("image*", p(img, img, img, img, img)))
    it("only matches appropriate elements to an asterisk", () => invalid("image*", p(img, "text")))

    it("matches group members to a group", () => valid("inline*", p(img)))
    it("doesn't match non-members to a group", () => invalid("inline*", doc(p())))
    it("matches multiple group members to an asterisk", () => valid("inline*", p(img, "text")))
    it("matches an element to a pipe expression", () => valid("(paragraph | heading)", doc(p())))
    it("doesn't match unmentioned elements to a pipe expr", () => invalid("(paragraph | heading)", p(img)))

    it("matches a simple sequence", () => valid("paragraph horizontal_rule paragraph", p(p(), hr, p())))
    it("fails when a sequence is too long", () => invalid("paragraph horizontal_rule", p(p(), hr, p())))
    it("fails when a sequence is too short", () => invalid("paragraph horizontal_rule paragraph", p(p(), hr)))
    it("fails when a sequence starts incorrectly", () => invalid("paragraph horizontal_rule", p(hr, p(), hr)))

    it("accepts a sequence asterisk matching zero elements", () => valid("heading paragraph*", doc(h1())))
    it("accepts a sequence asterisk matching multiple elts", () => valid("heading paragraph*", doc(h1(), p(), p())))
    it("accepts a sequence plus matching one element", () => valid("heading paragraph+", doc(h1(), p())))
    it("accepts a sequence plus matching multiple elts", () => valid("heading paragraph+", doc(h1(), p(), p())))
    it("fails when a sequence plus has no elements", () => invalid("heading paragraph+", doc(h1())))
    it("fails when a sequence plus misses its start", () => invalid("heading paragraph+", doc(p(), p())))

    it("accepts an optional element being present", () => valid("image?", p(img)))
    it("accepts an optional element being missing", () => valid("image?", p()))
    it("fails when an optional element is present twice", () => invalid("image?", p(img, img)))

    it("accepts a matching count", () => valid("hard_break{2}", p(br, br)))
    it("rejects a count that comes up short", () => invalid("hard_break{2}", p(br)))
    it("rejects a count that has too many elements", () => invalid("hard_break{2}", p(br, br, br)))
    it("accepts a count on the lower bound", () => valid("hard_break{2, 4}", p(br, br)))
    it("accepts a count on the upper bound", () => valid("hard_break{2, 4}", p(br, br, br, br)))
    it("rejects a range with too few elements", () => invalid("hard_break{2, 4}", p(br)))
    it("rejects a range with too many elements", () => invalid("hard_break{2, 4}", p(br, br, br, br, br)))
    it("rejects a range with a bad element after it", () => invalid("hard_break{2, 4} text*", p(br, br, img)))
    it("accepts a range with a matching element after it", () => valid("hard_break{2, 4} image?", p(br, br, img)))
    it("accepts an open range", () => valid("hard_break{2,}", p(br, br)))
    it("accepts an open range matching many", () => valid("hard_break{2,}", p(br, br, br, br, br)))
    it("rejects an open range with too few elements", () => invalid("hard_break{2,}", p(br)))

    it("accepts a matching attr", () => valid("heading[level=2]", doc(h2())))
    it("rejects a mismatched attr", () => invalid("heading[level=2]", doc(h1())))

    it("accepts a set with all marks", () => valid("hard_break<_>", p(em(br))))
    it("rejects a disallowed mark", () => invalid("hard_break", p(em(br))))
    it("accepts a matching mark", () => valid("hard_break<em strong>", p(em(br))))
    it("rejects a non-matching mark", () => invalid("hard_break<code strong>", p(em(br))))

    it("accepts an attribute-constrained count", () => valid("hard_break{.level}", p(br, br, br)))
    it("rejects a bad attribute-constrained count", () => invalid("hard_break{.level}", p(br, br)))
  })

  describe("fillBefore", () => {
    function fill(expr, before, after, result) {
      let filled = get(expr).getMatchAt(attrs, before.content).fillBefore(after.content, true)
      if (result) {
        ist(filled)
        ist(filled, result.content, eq)
      } else {
        ist(!filled)
      }
    }

    it("returns the empty fragment when things match", () =>
       fill("paragraph horizontal_rule paragraph", doc(p(), hr), doc(p()), doc()))

    it("adds a node when necessary", () =>
       fill("paragraph horizontal_rule paragraph", doc(p()), doc(p()), doc(hr)))

    it("accepts an asterisk across the bound", () => fill("hard_break*", p(br), p(br), p()))

    it("accepts an asterisk only on the left", () => fill("hard_break*", p(br), p(), p()))

    it("accepts an asterisk only on the right", () => fill("hard_break*", p(), p(br), p()))

    it("accepts an asterisk with no elements", () => fill("hard_break*", p(), p(), p()))

    it("accepts a plus across the bound", () => fill("hard_break+", p(br), p(br), p()))

    it("adds an element for a content-less plus", () => fill("hard_break+", p(), p(), p(br)))

    it("fails for a mismatched plus", () => fill("hard_break+", p(), p(img), null))

    it("accepts asterisk with content on both sides", () => fill("heading* paragraph*", doc(h1()), doc(p()), doc()))

    it("accepts asterisk with no content after", () => fill("heading* paragraph*", doc(h1()), doc(), doc()))

    it("accepts plus with content on both sides", () => fill("heading+ paragraph+", doc(h1()), doc(p()), doc()))

    it("accepts plus with no content after", () => fill("heading+ paragraph+", doc(h1()), doc(), doc(p())))

    it("adds elements to match a count", () => fill("hard_break{3}", p(br), p(br), p(br)))

    it("fails when there are too many elements", () => fill("hard_break{3}", p(br, br), p(br, br), null))

    it("adds elements for two counted groups", () => fill("code_block{2} paragraph{2}", doc(pre()), doc(p()), doc(pre(), p())))

    function fill3(expr, before, mid, after, left, right) {
      let content = get(expr)
      let a = content.getMatchAt(attrs, before.content).fillBefore(mid.content)
      let b = a && content.getMatchAt(attrs, before.content.append(a).append(mid.content)).fillBefore(after.content, true)
      if (left) {
        ist(b)
        ist(a, left.content, eq)
        ist(b, right.content, eq)
      } else {
        ist(!b)
      }
    }

    it("completes a sequence", () =>
       fill3("paragraph horizontal_rule paragraph horizontal_rule paragraph",
             doc(p()), doc(p()), doc(p()), doc(hr), doc(hr)))

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
