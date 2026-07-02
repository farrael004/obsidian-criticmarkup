import IntervalTree, { Node } from "@flatten-js/interval-tree";

export interface OffsettableRange {
	from: number;
	to: number;
	apply_offset(offset: number): void;
}

/**
 * Shift every range in the interval tree by a sorted list of `[position, delta]` offsets,
 * updating the range values, interval keys and augmented `max` cache in place. `offsets` must
 * be ascending by (pre-edit) position and is consumed; each range gets the accumulated delta
 * of every offset at or before its start.
 */
export function applyOffsetsToRangeTree(tree: IntervalTree, offsets: [number, number][]) {
	const nil_node = tree.nil_node;
	let cumulative_offset = 0;
	function visitNode(node: Node<OffsettableRange>) {
		if (node != null && node != nil_node) {
			visitNode(node.left);
			while (offsets.length && node.item.key.low >= offsets[0][0])
				cumulative_offset += offsets.shift()![1];
			node.item.value.apply_offset(cumulative_offset);
			node.item.key.low = node.item.value.from;
			node.item.key.high = node.item.value.to;
			visitNode(node.right);
			// Recompute max from the offset key + both children; a manual max.low/max.high
			// copy leaves it stale for nil-child nodes and breaks subsequent search() calls.
			node.update_max();
		}
	}
	visitNode(tree.root!);
}
