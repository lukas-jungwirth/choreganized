/**
 * Triage's verdict, applied (→ scripts/triage-apply.ts). The labels are built from
 * these fields, so a verdict that strays outside the schema is refused here, not
 * turned into a label.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { issueTitle, labelChanges, parseVerdict, type Verdict } from './triage-apply';

const bug: Verdict = {
	kind: 'bug',
	area: 'cooking',
	size: 's',
	confidence: 'found',
	reproduced: true,
	open_questions: [],
	fixed_on_dev_commit: '',
	title: 'Bug: Import schneidet Schritte ab'
};

describe('parseVerdict', () => {
	it('reads a verdict that matches the schema', () => {
		assert.deepEqual(parseVerdict(JSON.stringify(bug)), bug);
	});

	it('refuses a field outside its enum — no label is ever made from free text', () => {
		assert.throws(
			() => parseVerdict(JSON.stringify({ ...bug, area: 'cooking,agent:build' })),
			/"area" is "cooking,agent:build"/
		);
		assert.throws(() => parseVerdict(JSON.stringify({ ...bug, size: 'xs' })), /"size"/);
		assert.throws(() => parseVerdict(JSON.stringify({ ...bug, kind: 'feature' })), /"kind"/);
	});

	it('refuses a missing field, an extra one, and the wrong types', () => {
		const { reproduced: _, ...missing } = bug;
		assert.throws(() => parseVerdict(JSON.stringify(missing)), /no "reproduced"/);
		assert.throws(() => parseVerdict(JSON.stringify({ ...bug, labels: ['x'] })), /unknown field/);
		assert.throws(
			() => parseVerdict(JSON.stringify({ ...bug, reproduced: 'yes' })),
			/not a boolean/
		);
		assert.throws(
			() => parseVerdict(JSON.stringify({ ...bug, open_questions: ['', 'x'] })),
			/open_questions/
		);
		assert.throws(
			() => parseVerdict(JSON.stringify({ ...bug, fixed_on_dev_commit: 'main; rm -rf' })),
			/fixed_on_dev_commit/
		);
		assert.throws(() => parseVerdict(''), SyntaxError);
		assert.throws(() => parseVerdict('[]'), /not an object/);
	});
});

describe('issueTitle', () => {
	it('keeps the app’s prefix, adds it when missing, and stays on one line', () => {
		assert.equal(issueTitle(bug), 'Bug: Import schneidet Schritte ab');
		assert.equal(issueTitle({ ...bug, title: 'Steps cut\nshort' }), 'Bug: Steps cut short');
		assert.equal(issueTitle({ ...bug, kind: 'idea', title: 'idea: dark mode' }), 'idea: dark mode');
	});

	it('cuts at 70 characters', () => {
		const title = issueTitle({ ...bug, title: `Bug: ${'x'.repeat(80)}` });
		assert.equal(title.length, 70);
		assert.ok(title.endsWith('…'));
	});
});

describe('labelChanges', () => {
	it('labels a new bug with its kind, area and size', () => {
		assert.deepEqual(labelChanges(bug, []), {
			add: ['bug', 'area:cooking', 'size:s'],
			remove: []
		});
	});

	it('replaces a previous triage’s kind, area and size, and leaves other labels alone', () => {
		const current = ['idea', 'area:home', 'size:m', 'needs-info', 'agent:build', 'documentation'];
		assert.deepEqual(labelChanges(bug, current), {
			add: ['bug', 'area:cooking', 'size:s'],
			remove: ['idea', 'area:home', 'size:m', 'needs-info']
		});
	});

	it('asks for info only when the cause cannot be told', () => {
		const unclear = labelChanges({ ...bug, confidence: 'cannot-tell' }, []);
		assert.ok(unclear.add.includes('needs-info'));
		assert.ok(!labelChanges({ ...bug, confidence: 'plausible' }, []).add.includes('needs-info'));
	});

	it('marks a bug dev already fixes', () => {
		assert.ok(
			labelChanges({ ...bug, fixed_on_dev_commit: '9b83dc3' }, []).add.includes('fixed-on-dev')
		);
	});

	it('labels a duplicate as nothing else', () => {
		assert.deepEqual(labelChanges({ ...bug, kind: 'duplicate' }, ['bug', 'area:cooking']), {
			add: ['duplicate'],
			remove: ['bug', 'area:cooking']
		});
	});

	it('never adds agent:build — only the hand-on step does', () => {
		assert.ok(!labelChanges(bug, []).add.includes('agent:build'));
	});
});
