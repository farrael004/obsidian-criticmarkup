import IntervalTree from "@flatten-js/interval-tree";

import { applyOffsetsToRangeTree, type OffsettableRange } from "../src/editor/base/edit-util/range-offset";

// Minimal stand-in for a CriticMarkupRange: the offset logic only needs from/to and
// apply_offset(). Using plain objects keeps this test free of the Obsidian import chain.
function makeRange(from: number, to: number): OffsettableRange {
	return {
		from,
		to,
		apply_offset(offset: number) {
			this.from += offset;
			this.to += offset;
		},
	};
}

function buildTree(ranges: OffsettableRange[]) {
	const tree = new IntervalTree();
	for (const range of ranges) tree.insert([range.from, range.to], range);
	return tree;
}

describe("applyOffsetsToRangeTree keeps the interval tree searchable", () => {
	// This is the core invariant behind the "duplicate addition" bug: range-state.ts removes
	// the ranges affected by an edit via tree.search([fromA, toA]) and re-parses/re-inserts the
	// changed region. If the augmented `max` cache is corrupted while applying offsets, search()
	// silently misses a range, so it is never removed but still gets re-parsed — leaving two
	// copies of the same range in the tree.
	test("every range is still found by search() after a document-growing offset", () => {
		const ranges = Array.from({ length: 7 }, (_, i) => makeRange(i * 10, i * 10 + 5));
		const tree = buildTree(ranges);

		// Simulate a document-growing edit at the start (e.g. typing): shift everything right.
		applyOffsetsToRangeTree(tree, [[0, 100]]);

		for (const range of ranges) {
			const hits = tree.search([range.from, range.to]) as OffsettableRange[];
			expect(
				hits.includes(range),
				`search([${range.from}, ${range.to}]) failed to find its own range — ` +
					`a corrupted max cache pruned the subtree, which is what caused duplicate ranges`,
			).toBe(true);
		}
	});

	test("offsets are applied cumulatively per range position", () => {
		const ranges = [makeRange(0, 5), makeRange(20, 25), makeRange(40, 45)];
		const tree = buildTree(ranges);

		// Two edits: +100 from position 10 onward, then a further +10 from position 30 onward.
		applyOffsetsToRangeTree(tree, [
			[10, 100],
			[30, 10],
		]);

		expect([ranges[0].from, ranges[0].to]).toEqual([0, 5]); // before both edits
		expect([ranges[1].from, ranges[1].to]).toEqual([120, 125]); // after first edit only
		expect([ranges[2].from, ranges[2].to]).toEqual([150, 155]); // after both edits

		for (const range of ranges) {
			const hits = tree.search([range.from, range.to]) as OffsettableRange[];
			expect(hits.includes(range)).toBe(true);
		}
	});

	test("ranges shifted left by a deletion remain searchable", () => {
		const ranges = Array.from({ length: 7 }, (_, i) => makeRange(100 + i * 10, 100 + i * 10 + 5));
		const tree = buildTree(ranges);

		// A deletion near the front shifts later ranges left.
		applyOffsetsToRangeTree(tree, [[105, -20]]);

		for (const range of ranges) {
			const hits = tree.search([range.from, range.to]) as OffsettableRange[];
			expect(hits.includes(range)).toBe(true);
		}
	});
});
