/**
 * `npm test` — plain `node --test`, same as `utils/shopping.test.ts`.
 *
 * The hub is the one piece of the live channel that is pure: no database, no
 * request, no DOM. What is worth pinning down here is exactly what a walkthrough
 * can't show you — that one household never hears another's events, that a
 * stream which has already died doesn't take the others down with it, and that
 * unsubscribing really stops delivery rather than merely stopping the rendering
 * (→ DECISIONS #135).
 */
import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { isLiveTopic, listenerCount, publish, subscribe, type LiveEvent } from './live.ts';

const ACTOR = { memberId: 'm1', displayName: 'Elisabeth', color: '#7A9E7E' };

const CHECKED: LiveEvent = {
	topic: 'shopping',
	kind: 'checked',
	actor: ACTOR,
	itemId: 'i1',
	name: 'Tomatoes'
};

/** The hub is a process-global on purpose, so each test starts by emptying it. */
const teardowns: (() => void)[] = [];

function listen(householdId: string, into: LiveEvent[]): void {
	teardowns.push(subscribe(householdId, (event) => into.push(event)));
}

beforeEach(() => {
	while (teardowns.length > 0) teardowns.pop()!();
});

describe('publish', () => {
	it('reaches every stream on the household', () => {
		const phone: LiveEvent[] = [];
		const tablet: LiveEvent[] = [];
		listen('h1', phone);
		listen('h1', tablet);

		publish('h1', CHECKED);

		assert.deepEqual(phone, [CHECKED]);
		assert.deepEqual(tablet, [CHECKED]);
	});

	it('never crosses households', () => {
		const ours: LiveEvent[] = [];
		const theirs: LiveEvent[] = [];
		listen('h1', ours);
		listen('h2', theirs);

		publish('h1', CHECKED);

		assert.equal(ours.length, 1);
		assert.deepEqual(theirs, []);
	});

	it('is a no-op when nobody is looking', () => {
		assert.doesNotThrow(() => publish('nobody-here', CHECKED));
	});

	it('drops a listener that throws and still delivers to the rest', () => {
		const good: LiveEvent[] = [];
		teardowns.push(
			subscribe('h1', () => {
				throw new Error('stream is gone');
			})
		);
		listen('h1', good);

		publish('h1', CHECKED);
		assert.deepEqual(good, [CHECKED], 'the healthy stream still got it');
		assert.equal(listenerCount('h1'), 1, 'the broken one was dropped');

		publish('h1', CHECKED);
		assert.equal(good.length, 2, 'and the healthy one keeps working afterwards');
	});
});

describe('subscribe', () => {
	it('stops delivering once torn down, and forgets the household', () => {
		const seen: LiveEvent[] = [];
		const stop = subscribe('h1', (event) => seen.push(event));

		publish('h1', CHECKED);
		stop();
		publish('h1', CHECKED);

		assert.equal(seen.length, 1);
		assert.equal(listenerCount('h1'), 0);
	});

	it('survives being torn down twice — both the abort and the cancel call it', () => {
		const stop = subscribe('h1', () => {});
		stop();
		assert.doesNotThrow(stop);
	});

	it('leaves the other streams alone when one goes', () => {
		const staying: LiveEvent[] = [];
		const leaving = subscribe('h1', () => {});
		listen('h1', staying);

		leaving();
		publish('h1', CHECKED);

		assert.deepEqual(staying, [CHECKED]);
	});
});

describe('isLiveTopic', () => {
	it('accepts what the endpoint may stream and nothing else', () => {
		assert.equal(isLiveTopic('shopping'), true);
		assert.equal(isLiveTopic('tasks'), false);
		assert.equal(isLiveTopic('__proto__'), false);
	});
});
