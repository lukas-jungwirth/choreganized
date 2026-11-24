/**
 * The shared amount reader (→ plan 42): how a number, a unit and a counting
 * word are spelled. The two line parsers have their own contract tables
 * (`ingredients.test.ts`, `lists.test.ts`); this file pins the pieces they
 * share, so a spelling added for one cannot silently change the other.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
	countingWord,
	fusedOf,
	isContainerWord,
	isTimes,
	leadingAmount,
	markerOf,
	measureKey,
	measureOf,
	numberOf,
	parseQuantity,
	rangeLength,
	RECIPE_UNITS,
	unitFromWord
} from './amounts.ts';

describe('unitFromWord', () => {
	it('reads every unit back to itself', () => {
		for (const unit of RECIPE_UNITS) assert.equal(unitFromWord(unit), unit);
	});

	it('reads both languages, in any casing, with or without a dot', () => {
		const cases: [string, string][] = [
			['EL', 'tbsp'],
			['El', 'tbsp'],
			['Esslöffel', 'tbsp'],
			['Tbsp.', 'tbsp'],
			['TL', 'tsp'],
			['Teelöffel', 'tsp'],
			['tsp.', 'tsp'],
			['Gramm', 'g'],
			['l', 'L'],
			['Liter', 'L'],
			['Stk.', 'pcs'],
			['Stück', 'pcs'],
			['Pkg.', 'pack'],
			['Packung', 'pack'],
			['Päckchen', 'pack']
		];
		for (const [word, unit] of cases) assert.equal(unitFromWord(word), unit, word);
	});

	it('is not fooled by an object key, an x, or a word that only looks like a unit', () => {
		for (const word of ['constructor', '__proto__', 'x', 'lemons', 'Glas', 'cups', 'lb']) {
			assert.equal(unitFromWord(word), null, word);
		}
	});
});

describe('measureOf', () => {
	it('counts a Deka as ten grams', () => {
		for (const word of ['dag', 'dkg', 'Deka', 'dag.']) {
			assert.deepEqual(measureOf(word), { unit: 'g', factor: 10 }, word);
		}
		assert.deepEqual(measureOf('kg'), { unit: 'kg', factor: 1 });
		assert.equal(measureOf('Zehen'), null);
	});
});

describe('counting words', () => {
	it('knows a word in singular and plural as the same thing', () => {
		assert.equal(countingWord('Zehe'), 'zehe');
		assert.equal(countingWord('Zehen'), 'zehe');
		assert.equal(countingWord('Gläser'), 'glas');
		assert.equal(countingWord('Msp.'), 'msp');
		assert.equal(countingWord('Messerspitze'), 'msp');
		assert.equal(countingWord('cloves'), 'clove');
		assert.equal(countingWord('leaves'), 'leaf');
	});

	it('leaves units and ordinary words alone', () => {
		for (const word of ['g', 'EL', 'Stück', 'Zwiebel', 'Kugel', 'große', 'constructor']) {
			assert.equal(countingWord(word), null, word);
		}
	});

	it('says which of them are containers', () => {
		for (const word of ['Dose', 'Dosen', 'Becher', 'Glas', 'Flasche', 'can', 'jars']) {
			assert.ok(isContainerWord(word), word);
		}
		for (const word of ['Zehe', 'Bund', 'Prise', 'Scheibe', 'clove', 'g', 'Tomaten']) {
			assert.ok(!isContainerWord(word), word);
		}
	});

	it('compares a unit or a counting word by what it measures', () => {
		assert.equal(measureKey('EL'), measureKey('tbsp'));
		assert.equal(measureKey('Zehen'), measureKey('Zehe'));
		assert.equal(measureKey('L'), 'L');
		assert.notEqual(measureKey('Zehe'), measureKey('Bund'));
		assert.equal(measureKey(null), null);
		assert.equal(measureKey('Zwiebel'), null);
	});
});

describe('numbers', () => {
	it('reads one token as a number, and says what kind', () => {
		assert.deepEqual(numberOf('3'), { value: 3, kind: 'whole' });
		assert.deepEqual(numberOf('1,5'), { value: 1.5, kind: 'decimal' });
		assert.deepEqual(numberOf('1.5'), { value: 1.5, kind: 'decimal' });
		assert.deepEqual(numberOf('1/2'), { value: 0.5, kind: 'fraction' });
		assert.deepEqual(numberOf('½'), { value: 0.5, kind: 'fraction' });
		assert.deepEqual(numberOf('1½'), { value: 1.5, kind: 'fraction' });
		for (const token of ['1.', '4-Korn', '10er', '1/0', 'x3', '']) {
			assert.equal(numberOf(token), null, token);
		}
	});

	it('splits a number fused with a word', () => {
		assert.deepEqual(fusedOf('500g'), { value: 500, word: 'g' });
		assert.deepEqual(fusedOf('1,5kg'), { value: 1.5, word: 'kg' });
		assert.deepEqual(fusedOf('2pkg.'), { value: 2, word: 'pkg.' });
		assert.deepEqual(fusedOf('7up'), { value: 7, word: 'up' });
		assert.equal(fusedOf('500'), null);
		assert.equal(fusedOf('g500'), null);
	});

	it('reads a count marker', () => {
		assert.equal(markerOf('3x'), 3);
		assert.equal(markerOf('x3'), 3);
		assert.equal(markerOf('3×'), 3);
		assert.equal(markerOf('x'), null);
		assert.ok(isTimes('x') && isTimes('×') && isTimes('X'));
		assert.ok(!isTimes('3x') && !isTimes(undefined));
	});

	it('reads the amount a line leads with, and how much of the line it took', () => {
		assert.deepEqual(leadingAmount('1 1/2 TL Zimt'), { value: 1.5, length: 5 });
		assert.deepEqual(leadingAmount('1/2 Zitrone'), { value: 0.5, length: 3 });
		assert.deepEqual(leadingAmount('1½ TL'), { value: 1.5, length: 2 });
		assert.deepEqual(leadingAmount('½ TL'), { value: 0.5, length: 1 });
		assert.equal(leadingAmount('0 kg Mehl')?.value, null);
		assert.equal(leadingAmount('99999 g')?.value, 9999);
		assert.equal(leadingAmount('Salz'), null);
	});

	it('finds the tail of a range, and leaves what follows it', () => {
		const after = (rest: string) => rest.slice(rangeLength(rest)).trim();
		assert.equal(after('- 2 EL Öl'), 'EL Öl');
		assert.equal(after('–3 Zwiebeln'), 'Zwiebeln');
		assert.equal(after('bis 3 EL'), 'EL');
		assert.equal(after('to 3 tablespoons'), 'tablespoons');
		assert.equal(after('-250g Mehl'), 'g Mehl');
		assert.equal(after('-½ TL Salz'), 'TL Salz');
		// Not a range: a hyphen that starts a word, and no hyphen at all.
		assert.equal(rangeLength('-Minuten-Eier'), 0);
		assert.equal(rangeLength('EL Öl'), 0);
	});

	it('takes a bare amount and nothing else', () => {
		assert.equal(parseQuantity('1½'), 1.5);
		assert.equal(parseQuantity('0,5'), 0.5);
		assert.equal(parseQuantity('3/4'), 0.75);
		assert.equal(parseQuantity('2 tsp'), null);
		assert.equal(parseQuantity(''), null);
	});
});
