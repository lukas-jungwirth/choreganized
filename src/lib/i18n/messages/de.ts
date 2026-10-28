/**
 * Every word the app says, in German.
 *
 * Typed as `Messages`, i.e. as `typeof en` — a key that is missing, misspelt or
 * has the wrong signature fails `npm run check`. Keep the sections, the order
 * and the comments' anchors in step with `en.ts`; the two files are meant to be
 * read side by side.
 *
 * Tone: the English copy is warm and plain-spoken, so the German is too — "du",
 * never "Sie", short sentences, no officialese. Where English has a shape
 * German doesn't ("It's Lukas's turn"), the German says the same thing its own
 * way ("Lukas ist dran") rather than translating the grammar.
 *
 * **Austrian German** — the household is in Vienna. Mostly that is `Intl`'s job
 * ("Jänner", not "Januar" → `INTL_LOCALE` in `../locale.ts`); where a word here
 * differs from the German-German one, Austrian wins ("Mist", not "Müll"). None
 * of it is dialect: this is the written standard as Austria writes it, so it
 * still reads plainly to any German speaker.
 */
import {
	dayOfMonth,
	daysBetween,
	formatDayStamp,
	formatMonthName,
	formatMonthRange,
	formatShortDate,
	formatWeekday,
	formatWeekdayLong,
	formatWeekdayShort,
	needsYear,
	type CalendarDate
} from '$lib/utils/dates';
import { INTL_LOCALE } from '$lib/i18n/locale';
import type { RepeatUnit } from '$lib/utils/expenses';
import type { HolidayKey } from '$lib/utils/holidays';
import { formatAmount, formatIngredient } from '$lib/utils/ingredients';
import { currencySymbol, formatMoney } from '$lib/utils/money';
import type { MealSlot } from '$lib/utils/meals';
import { formatQuantity, type UnitLabels } from '$lib/utils/shopping';
import type { RecurUnit } from '$lib/utils/tasks';
import type { Messages, RichText } from './en';

const L = 'de';

/** Stored canonically, shown in German: "EL"/"TL" are what a recipe here says. */
const UNITS: UnitLabels = {
	pcs: 'Stk.',
	g: 'g',
	kg: 'kg',
	ml: 'ml',
	L: 'l',
	pack: 'Pck.',
	tbsp: 'EL',
	tsp: 'TL'
};

/**
 * Austria's own names, which is the point of keeping them here rather than in
 * `utils/holidays.ts`: the 25th is **Christtag** and the 26th **Stefanitag**,
 * not the "1./2. Weihnachtsfeiertag" a German catalog would write (→ SPEC §3.6).
 */
const HOLIDAYS: Record<HolidayKey, string> = {
	newYear: 'Neujahr',
	epiphany: 'Heilige Drei Könige',
	easterMonday: 'Ostermontag',
	labourDay: 'Staatsfeiertag',
	ascension: 'Christi Himmelfahrt',
	whitMonday: 'Pfingstmontag',
	corpusChristi: 'Fronleichnam',
	assumption: 'Mariä Himmelfahrt',
	nationalDay: 'Nationalfeiertag',
	allSaints: 'Allerheiligen',
	christmas: 'Christtag',
	stStephen: 'Stefanitag'
};

/** "Christtag und Stefanitag" — `Intl` supplies the joiner. */
function list(items: string[]): string {
	return new Intl.ListFormat(INTL_LOCALE[L], { style: 'long', type: 'conjunction' }).format(items);
}

/** Der letzte Einkaufstag, so benannt, wie man ihn ausspricht. */
function shoppingDay(lastOpenDay: CalendarDate, today: CalendarDate): string {
	const days = daysBetween(today, lastOpenDay);
	if (days <= 0) return 'heute';
	if (days === 1) return 'morgen';
	return formatWeekdayLong(lastOpenDay, L);
}

export const de: Messages = {
	/* ── The document itself ───────────────────────────────────────────────── */
	meta: {
		description:
			'Every chore, organized. Die gemeinsame Haushalts-App für Einkauf, Essensplanung und Aufgaben.'
	},

	/* ── Words that repeat everywhere ──────────────────────────────────────── */
	common: {
		saveChanges: 'Änderungen speichern',
		cancel: 'Abbrechen',
		edit: 'Bearbeiten',
		backToHome: 'Zurück zur Startseite',
		anyone: 'Alle',
		name: 'Name',
		appName: 'Choreganized',
		pageTitle: (screen: string) => `${screen} · Choreganized`
	},

	/* ── The kit's own words ───────────────────────────────────────────────── */
	ui: {
		close: 'Schließen',
		dismiss: 'Ausblenden',
		search: 'Suchen',
		clearSearch: 'Suche löschen',
		/** Kein `toLowerCase()`: deutsche Substantive bleiben großgeschrieben. */
		decrease: (label: string) => `${label} verringern`,
		increase: (label: string) => `${label} erhöhen`,
		yourColour: 'Deine Farbe',
		colours: {
			sage: 'Salbei',
			terracotta: 'Terrakotta',
			blue: 'Blau',
			amber: 'Bernstein',
			plum: 'Pflaume'
		},
		colourTaken: (colour: string) => `${colour} — schon vergeben`
	},

	/* ── The tab bar [02] ──────────────────────────────────────────────────── */
	nav: {
		home: 'Start',
		shopping: 'Einkauf',
		tasks: 'Aufgaben',
		cooking: 'Kochen',
		expenses: 'Ausgaben',
		sections: 'Bereiche',
		overdueBadge: (count: number) => `${count} überfällig`,
		back: 'Zurück'
	},

	/* ── Dates ─────────────────────────────────────────────────────────────── */
	date: {
		/** "14. Juli". */
		short: (date: CalendarDate, withYear = false) => formatShortDate(date, L, withYear),
		shortAuto: (date: CalendarDate, today: CalendarDate) =>
			formatShortDate(date, L, needsYear(date, today)),
		/** "Sa". */
		weekday: (date: CalendarDate) => formatWeekday(date, L),
		/** "MO". */
		weekdayShort: (date: CalendarDate) => formatWeekdayShort(date, L),
		/** "Donnerstag". */
		weekdayLong: (date: CalendarDate) => formatWeekdayLong(date, L),
		dayOfMonth: (date: CalendarDate) => dayOfMonth(date),
		monthRange: (from: CalendarDate, to: CalendarDate) => formatMonthRange(from, to, L),
		monthName: (date: CalendarDate, today: CalendarDate) => formatMonthName(date, today, L),

		dayLabel: (date: CalendarDate, today: CalendarDate) => {
			const days = daysBetween(today, date);
			if (days === 0) return 'Heute';
			if (days === -1) return 'Gestern';
			return formatDayStamp(date, L, needsYear(date, today));
		},

		/**
		 * "heute fällig", "morgen fällig", "in 2 Tagen", "seit 3 Tagen überfällig".
		 *
		 * Überfällig zählt im Deutschen mit "seit": "3 Tage überfällig" klingt nach
		 * einer Dauer, die noch bevorsteht.
		 */
		dueMeta: (dueDate: CalendarDate, today: CalendarDate) => {
			const days = daysBetween(today, dueDate);
			if (days < 0) {
				return days === -1 ? 'seit 1 Tag überfällig' : `seit ${-days} Tagen überfällig`;
			}
			if (days === 0) return 'heute fällig';
			if (days === 1) return 'morgen fällig';
			if (days <= 3) return `in ${days} Tagen`;
			if (days <= 6) return formatWeekday(dueDate, L);
			return formatShortDate(dueDate, L, needsYear(dueDate, today));
		},

		/** "Heute · 17. Jul", "Sa · 19. Jul", "24. Jul". */
		dateLabel: (date: CalendarDate, today: CalendarDate) => {
			const days = daysBetween(today, date);
			const short = formatShortDate(date, L, needsYear(date, today));
			if (days === 0) return `Heute · ${short}`;
			if (days === 1) return `Morgen · ${short}`;
			if (days === -1) return `Gestern · ${short}`;
			if (days > 1 && days <= 6) return `${formatWeekday(date, L)} · ${short}`;
			return short;
		}
	},

	/* ── Units and amounts ─────────────────────────────────────────────────── */
	units: {
		labels: UNITS,
		quantity: (quantity: number | null, unit: string | null) =>
			formatQuantity(quantity, unit, UNITS),
		amount: (quantity: number | null, unit: string | null) => formatAmount(quantity, unit, UNITS),
		ingredient: (row: { quantity: number | null; unit: string | null; name: string }) =>
			formatIngredient(row, UNITS)
	},

	/* ── Task vocabulary ───────────────────────────────────────────────────── */
	task: {
		efforts: {
			none: 'Keine',
			small: 'Klein',
			medium: 'Mittel',
			large: 'Groß',
			huge: 'Sehr groß'
		},
		repeats: {
			none: 'Einmalig',
			'day-1': 'Jeden Tag',
			'week-1': 'Jede Woche',
			'week-2': 'Alle 2 Wochen',
			'month-1': 'Jeden Monat'
		},
		repeatCustom: 'Eigener Rhythmus…',
		customUnits: {
			day: 'Tage',
			week: 'Wochen',
			month: 'Monate'
		},
		snoozes: {
			tomorrow: 'Morgen',
			days3: 'In 3 Tagen',
			week1: 'In 1 Woche',
			weeks2: 'In 2 Wochen'
		},
		postpones: {
			tomorrow: 'Einen Tag später',
			days3: '3 Tage später',
			week1: 'Eine Woche später',
			weeks2: '2 Wochen später'
		},
		starters: {
			bins: 'Mist rausbringen',
			bedsheets: 'Bettwäsche wechseln',
			bathroom: 'Bad putzen'
		},

		/** "Einmalig", "Täglich", "Wöchentlich", "Alle 2 Wochen", "Monatlich". */
		repeat: (unit: RecurUnit, interval: number) => {
			if (unit === 'none') return 'Einmalig';
			if (interval === 1) {
				return unit === 'day' ? 'Täglich' : unit === 'week' ? 'Wöchentlich' : 'Monatlich';
			}
			const plural = unit === 'day' ? 'Tage' : unit === 'week' ? 'Wochen' : 'Monate';
			return `Alle ${interval} ${plural}`;
		},

		points: (points: number) => `+${points}`,

		/**
		 * "Du bist dran" / "Elisabeth ist dran" — Deutsch braucht dafür keinen
		 * Genitiv, und "Elisabeths Runde" wäre steifer als das Original.
		 */
		turn: (assigneeName: string | null, isMine: boolean) => {
			if (!assigneeName) return 'Kann jemand übernehmen';
			return isMine ? 'Du bist dran' : `${assigneeName} ist dran`;
		},

		turnLabel: (assigneeName: string | null, isMine: boolean) => {
			if (!assigneeName) return 'Alle';
			return isMine ? 'Du bist dran' : `${assigneeName} ist dran`;
		},

		/** "erinnert gestern & heute früh". */
		reminderNote: (sentOn: (CalendarDate | null)[], today: CalendarDate) => {
			const phrases: string[] = [];

			for (const date of sentOn) {
				if (!date) continue;
				const days = daysBetween(today, date);
				const phrase =
					days === 0 ? 'heute früh' : days === -1 ? 'gestern' : formatShortDate(date, L);
				if (!phrases.includes(phrase)) phrases.push(phrase);
			}

			return phrases.length ? `erinnert ${phrases.join(' & ')}` : null;
		}
	},

	/* ── Shopping [03] [3a] [7d] [7g] ──────────────────────────────────────── */
	shopping: {
		title: 'Einkauf',
		progress: (checked: number, total: number) => `${checked} von ${total} erledigt`,
		manageStores: 'Geschäfte verwalten',
		other: 'Sonstiges',

		empty: {
			title: 'Noch nichts zu kaufen',
			copy: 'Trag ein, was ausgeht — nach Geschäft sortiert für alle, die einkaufen gehen.',
			cta: 'Erstes Ding eintragen'
		},

		quickAdd: {
			placeholder: 'Etwas eintragen…',
			label: 'Etwas eintragen',
			expand: 'Mit Menge und Geschäft eintragen',
			submit: 'Eintragen'
		},

		suggestions: {
			label: 'Vorschläge'
		},

		bought: {
			heading: (count: number) => `Zuletzt gekauft · ${count}`
		},

		row: {
			check: (item: string) => `${item} abhaken`,
			uncheck: (item: string) => `${item} zurück auf die Liste`,
			edit: (item: string) => `${item} bearbeiten`,
			reorder: (item: string) => `${item} verschieben`
		},

		undo: {
			checked: (item: string): RichText => [{ text: item, strong: true }, { text: ' abgehakt' }],
			action: 'Rückgängig'
		},

		live: {
			checked: (member: string, item: string): RichText => [
				{ text: `${member} hat ` },
				{ text: item, strong: true },
				{ text: ' geholt' }
			],
			checkedMany: (member: string, count: number): RichText => [
				{ text: `${member} hat ` },
				{ text: count === 1 ? '1 Sache' : `${count} Sachen`, strong: true },
				{ text: ' geholt' }
			],
			added: (member: string, item: string): RichText => [
				{ text: `${member} hat ` },
				{ text: item, strong: true },
				{ text: ' eingetragen' }
			],
			addedMany: (member: string, count: number): RichText => [
				{ text: `${member} hat ` },
				{ text: count === 1 ? '1 Sache' : `${count} Sachen`, strong: true },
				{ text: ' eingetragen' }
			]
		},

		sheet: {
			add: 'Eintragen',
			edit: 'Eintrag bearbeiten',
			name: 'Was',
			namePlaceholder: 'Sauerteigbrot',
			quantity: 'Menge',
			unit: 'Einheit',
			unitHint: 'Stk. · g · kg · ml · l …',
			store: 'Geschäft',
			addTo: (store: string) => `Auf die Liste für ${store}`,
			addToList: 'Auf die Liste',
			delete: 'Eintrag löschen'
		},

		stores: {
			title: 'Geschäfte',
			subtitle: 'Die Einkaufsliste nach Geschäft gruppieren',
			back: 'Zurück zum Einkauf',
			add: 'Geschäft hinzufügen',
			addButton: 'Hinzufügen',
			items: (count: number) => (count === 1 ? '1 Eintrag' : `${count} Einträge`),
			rename: (store: string) => `${store} umbenennen`,
			moveUp: (store: string) => `${store} nach oben`,
			moveDown: (store: string) => `${store} nach unten`,
			remove: (store: string) => `${store} löschen`,
			help: 'Mit den Pfeilen umsortieren — die Liste folgt dieser Reihenfolge, also ordne sie so, wie du durch die Stadt gehst. Schnell eingetragene Sachen landen im ersten Geschäft; alles ohne Geschäft steht unter „Sonstiges“.',
			deleteLabel: 'Geschäft löschen',
			deleteConfirm: (store: string) => `${store} löschen?`,
			deleteMoves: (count: number) =>
				count === 1
					? 'Der eine Eintrag wandert zu „Sonstiges“ — nichts geht verloren.'
					: `Die ${count} Einträge wandern zu „Sonstiges“ — nichts geht verloren.`,
			deleteEmpty: 'Es ist nichts eingetragen, also ändert sich sonst nichts.',
			defaults: {
				grocery: 'Supermarkt',
				drugstore: 'Drogerie',
				hardware: 'Baumarkt'
			}
		}
	},

	/* ── Home [8b] ─────────────────────────────────────────────────────────── */
	home: {
		title: 'Start',
		greeting: (time: 'morning' | 'afternoon' | 'evening'): string =>
			time === 'morning' ? 'Guten Morgen' : time === 'afternoon' ? 'Guten Tag' : 'Guten Abend',
		settingsLink: (names: string) => `Einstellungen · Haushalt: ${names}`,

		/** "Heute fällig · wöchentlich · 10 Pkt. wert" — Kadenz klein, wie im Satz. */
		nextChore: {
			eyebrow: 'Deine nächste Aufgabe',
			meta: (due: string, repeat: string, points: number) => {
				const line = `${due.charAt(0).toUpperCase() + due.slice(1)} · ${repeat.charAt(0).toLowerCase() + repeat.slice(1)}`;
				return points > 0 ? `${line} · ${points} Pkt. wert` : line;
			},
			markDone: 'Als erledigt markieren'
		},

		overdue: {
			count: (count: number) =>
				count === 1 ? '1 Aufgabe überfällig' : `${count} Aufgaben überfällig`,
			detail: (task: string, mine: boolean) => (mine ? `${task} · du bist dran` : task),
			view: 'Ansehen'
		},

		stats: {
			shopping: 'auf der Einkaufsliste',
			tasksDue: (count: number): string =>
				count === 1 ? 'Aufgabe heute fällig' : 'Aufgaben heute fällig'
		},

		dinner: {
			eyebrow: (slot: MealSlot) =>
				slot === 'dinner'
					? 'Abendessen heute'
					: slot === 'breakfast'
						? 'Frühstück heute'
						: slot === 'lunch'
							? 'Mittagessen heute'
							: 'Snack heute',
			cooking: (cook: string) => `${cook} kocht`,
			more: (count: number) => `+${count} weitere heute`,
			add: 'Abendessen eintragen'
		},

		activity: {
			title: 'Zuletzt erledigt',
			all: 'Alle'
		},

		/** "Platz 1" statt eines Ordnungszahl-Adjektivs — im Deutschen natürlicher. */
		standings: {
			tied: 'Diesen Monat steht es unentschieden',
			rank: (rank: number) => `Diesen Monat auf Platz ${rank}`,
			each: (points: number) => `je ${points} Pkt.`,
			solo: (points: number) => `${points} Pkt. diesen Monat`,
			ahead: (points: number, gap: number, rival: string) => `${points} Pkt. · ${gap} vor ${rival}`,
			behind: (points: number, gap: number, rival: string) =>
				`${points} Pkt. · ${gap} hinter ${rival}`
		}
	},

	/* ── Tasks [4a] [4b] [4c] [4d] ─────────────────────────────────────────── */
	tasks: {
		title: 'Aufgaben',
		newTask: 'Neue Aufgabe',

		sections: {
			overdue: 'Überfällig',
			today: 'Heute',
			upcoming: 'Demnächst',
			paused: 'Pausiert',
			undated: 'Ohne Datum'
		},

		view: {
			label: 'Ansicht',
			todo: 'Übersicht',
			history: 'Historie'
		},

		summary: {
			doneThisWeek: (count: number) => `${count} diese Woche erledigt`,
			seeHistory: 'Zur Historie'
		},

		awayBanner: {
			mine: (until: string) => `Du bist bis ${until} weg`,
			other: (name: string, until: string) => `${name} ist bis ${until} weg`,
			detailMine: 'Deine Aufgaben sind pausiert — nichts gilt als überfällig',
			detailOther: 'Die Aufgaben sind pausiert — nichts gilt als überfällig'
		},

		empty: {
			title: 'Noch keine Aufgaben',
			copy: 'Trag die Sachen ein, die ihr beide vergesst — abhaken bringt Punkte. Mit ein paar starten?',
			starters: 'Beliebte Klassiker',
			custom: 'Eigene Aufgabe anlegen'
		},

		row: {
			pausedUntil: (until: string) => `pausiert bis ${until}`,
			addedBy: (name: string) => `angelegt von ${name}`,
			markDone: (task: string) => `${task} als erledigt markieren`,
			markDoneFor: (task: string, assignee: string) =>
				`${task} als erledigt markieren — ${assignee} ist dran`,
			open: (task: string) => `${task} öffnen`
		},

		detail: {
			wasDue: (date: string) => `fällig war ${date}`,
			pts: (points: number) => `${points} Pkt.`,
			pausedNote: (name: string, until: string) =>
				`${name} ist bis ${until} weg — die hier ist pausiert, nicht überfällig.`,
			markAsDone: (points: number) => `Als erledigt markieren · +${points}`,
			snooze: 'Verschieben',
			// Beide dativ, damit `me` ("mir") in beiden passt — "an mir" wäre falsch.
			assignTo: (name: string) => `${name} zuweisen`,
			reassignTo: (name: string) => `${name} neu zuweisen`,
			me: 'mir',
			skip: 'Diesmal überspringen',
			skipNote: '· keine Punkte',
			edit: 'Aufgabe bearbeiten',
			delete: 'Aufgabe löschen',
			deleteConfirm: (task: string) => `${task} löschen?`,
			deleteCopy:
				'Sie kommt dann nicht mehr wieder. Alles schon Erledigte bleibt in der Historie — die Punkte bleiben im Haus.'
		},

		done: {
			label: 'Aufgabe erledigt',
			niceWork: (name: string) => `Gut gemacht, ${name}!`,
			logged: (task: string) => `${task} · in der Historie vermerkt`,
			points: (points: number) => `+${points} Punkte`,
			nextDue: (date: string) => `Nächste Fälligkeit ${date}`,
			handoverAnyone: 'Neu geplant · kann jemand übernehmen',
			handoverNext: (name: string) => `Neu geplant · als Nächstes ist ${name} dran`,
			handoverSame: (name: string) => `Neu geplant · weiterhin ${name}`,
			standingsSolo: (points: number) => `${points} Punkte diesen Monat`,
			standingsLeading: (mine: number, theirs: number) => `Du führst jetzt ${mine} – ${theirs}`,
			standingsTied: (mine: number, theirs: number) => `Gleichstand ${mine} – ${theirs}`,
			standingsBehind: (name: string, theirs: number, mine: number) =>
				`${name} führt ${theirs} – ${mine}`,
			undo: 'Rückgängig',
			undoFailed: 'Das ließ sich nicht rückgängig machen.'
		},

		choice: {
			label: 'Wer hat’s gemacht?',
			title: 'Wer hat’s gemacht?',
			assigned: (name: string) => `Diese Aufgabe ist ${name} zugewiesen.`,
			mine: 'Ich war’s',
			forThem: (name: string) => `${name} war’s`
		},

		snooze: {
			title: 'Verschieben auf…',
			rescheduleTitle: 'Neu planen auf…',
			orPick: 'Oder Datum wählen',
			to: (date: string) => `Verschieben auf ${date}`,
			move: (date: string) => `Verlegen auf ${date}`,
			needsDate: 'Wähle ein Datum zum Verschieben.'
		},

		form: {
			new: 'Neue Aufgabe',
			edit: 'Aufgabe bearbeiten',
			name: 'Aufgabe',
			namePlaceholder: 'Bad putzen',
			assignTo: 'Zuweisen an',
			alternate: 'Immer abwechseln',
			rotation: (names: string[]) => `${names.join(' → ')} …`,
			repeat: 'Wiederholung',
			every: 'Alle',
			unit: 'Einheit',
			firstDue: 'Erstmals fällig',
			nextDue: 'Nächste Fälligkeit',
			dueShortcuts: 'Schnellauswahl für das Datum',
			today: 'Heute',
			tomorrow: 'Morgen',
			noDate: 'Kein Datum',
			effort: 'Aufwand → Punkte',
			create: 'Aufgabe anlegen'
		},

		podium: {
			thisMonth: 'Diesen Monat',
			resets: (date: string) => `Reset am ${date}`,
			standings: 'Rangliste, beste zuerst'
		},

		historyScreen: {
			emptyTitle: 'Noch nichts erledigt',
			emptyCopy:
				'Hak eine Aufgabe ab und sie landet hier — was es war, wer es gemacht hat und was es wert war.',
			backToHistory: 'Zurück zur Historie',
			emptyStretch: 'In diesem Zeitraum wurde nichts erledigt.',
			showMonth: (month: string) => `${month} anzeigen`
		},

		split: {
			title: 'Wie sich die Aufgaben verteilen',
			subtitle: 'Der Anteil jeder Person an der geplanten Aufgabenlast.',
			empty: 'Leg eine wiederkehrende Aufgabe an, um die Verteilung zu sehen.'
		},

		pointsBoard: {
			title: 'Punkte',
			together: (total: number) => `${total} zusammen`,
			rangeLabel: 'Zeitraum',
			ranges: {
				'30d': '30 Tage',
				'3m': '3 Monate',
				year: 'Jahr',
				all: 'Gesamt'
			},
			you: 'du'
		},

		allCompleted: 'Alle erledigten Aufgaben'
	},

	/* ── Cooking [04] [3d] [7a] ────────────────────────────────────────────── */
	cooking: {
		title: 'Kochen',
		cookTime: (minutes: number) => `${minutes} Min.`,
		serves: (servings: number) => `Für ${servings}`,

		weekSwitch: {
			label: 'Welche Woche',
			current: 'Diese Woche',
			next: 'Nächste Woche',
			currentCount: (planned: number) => `Diese Woche · ${planned}`,
			nextCount: (planned: number) => `Nächste Woche · ${planned}`
		},

		slots: {
			breakfast: 'Frühstück',
			lunch: 'Mittagessen',
			dinner: 'Abendessen',
			snack: 'Snack'
		},

		week: {
			cookedBy: (cook: string) => `${cook} kocht`,
			nothingPlanned: 'Nichts geplant',
			dayLabel: (weekday: string, day: string) => `${weekday}, ${day}.`,
			planDay: (weekday: string, day: string) => `Essen für ${weekday}, ${day}. eintragen`,
			today: '(heute)'
		},

		mealMenu: {
			showRecipe: 'Rezept ansehen',
			startCooking: 'Kochmodus starten',
			change: 'Essen ändern',
			addAnother: (weekday: string) => `Noch ein Essen am ${weekday}`,
			remove: 'Aus dem Plan entfernen'
		},

		library: {
			title: 'Rezeptsammlung',
			browseAll: (count: number) => `Alle ansehen · ${count}`,
			recentlyAdded: 'Zuletzt hinzugefügt',
			addedOn: (date: string) => `am ${date} hinzugefügt`,
			firstTitle: 'Speichere dein erstes Rezept',
			firstSub: 'Danach landet es mit einem Tipp auf jedem Tag der Woche.'
		},

		dayPicker: {
			title: 'Welcher Tag?',
			eyebrow: 'In den Plan',
			free: 'Frei',
			day: (weekday: string, day: string, meal: string) => `${weekday}, ${day}. — ${meal}`,
			freeQuiet: 'frei',
			mealList: (names: string[]) => names.join(' · ')
		},

		plan: {
			eyebrow: 'Essen planen',
			searchRecipes: 'Rezepte durchsuchen',
			recipeGroup: 'Rezept',
			noMatch: 'Kein Rezept mit dem Namen — lieber etwas Ungespeichertes kochen?',
			moreMatches: (count: number) => `${count} weitere Treffer — tipp weiter, um einzugrenzen.`,
			mostRecent: (rest: number) => `Deine neuesten — such nach den anderen ${rest}.`,
			notSaved: 'Etwas kochen, das nicht gespeichert ist',
			notSavedPlaceholder: 'Pizzaabend',
			whichMeal: 'Welche Mahlzeit?',
			replaces: (meal: string) => `Ersetzt ${meal}`,
			cooking: 'Wer kocht?',
			optional: 'optional',
			addIngredients: 'Zutaten auf die Einkaufsliste',
			addIngredientsNote: 'Du wählst gleich aus, welche',
			addTo: (weekday: string) => `Für ${weekday} eintragen`,
			remove: 'Essen entfernen'
		},

		recipes: {
			title: 'Rezepte',
			saved: (count: number) => (count === 1 ? '1 gespeichert' : `${count} gespeichert`),
			back: 'Zurück zur Woche',
			search: 'Rezepte suchen',
			emptyTitle: 'Bau dein Kochbuch auf',
			emptyCopy:
				'Speichere, was ihr oft kocht. Danach landet es mit einem Tipp auf jedem Tag der Woche.',
			emptyCta: 'Rezept hinzufügen',
			noMatch: (query: string) => `Nichts passt zu „${query}“.`,
			newRecipe: 'Neues Rezept'
		},

		add: {
			title: 'Rezept hinzufügen',
			link: 'Aus einem Link',
			linkSub: 'Einen Rezept-Link einfügen',
			photo: 'Aus einem Foto',
			photoSub: 'Kochbuch- oder Magazinseite abfotografieren',
			text: 'Text einfügen',
			textSub: 'Den Rezepttext einfügen',
			manual: 'Von Hand eintragen',
			manualSub: 'Selbst eintippen',
			aiTag: 'KI',
			addPhotos: 'Fotos hinzufügen',
			morePhotos: 'Mehr hinzufügen',
			removePhoto: 'Foto entfernen'
		},

		recipe: {
			back: 'Zurück zu den Rezepten',
			options: 'Rezept-Optionen',
			addedBy: (name: string) => `Von ${name} angelegt`,
			addToPlan: 'In den Plan',
			pickForList: 'Zutaten für die Einkaufsliste auswählen',
			addToList: 'Auf die Liste',
			ingredients: 'Zutaten',
			cookingFor: 'Für wie viele',
			writtenFor: (count: number) => `notiert für ${count}`,
			steps: 'Schritte',
			startCookMode: 'Kochmodus starten',
			noStepsLead: 'Noch keine Schritte notiert — ',
			noStepsLink: 'trag sie ein',
			noStepsRest: ', dann führt dich der Kochmodus durch.'
		},

		menu: {
			edit: 'Rezept bearbeiten',
			duplicate: 'Duplizieren',
			share: 'Teilen',
			copy: 'Rezept kopieren',
			copied: 'In die Zwischenablage kopiert',
			delete: 'Rezept löschen',
			deleteConfirm: (name: string) => `${name} löschen?`,
			deleteCopy:
				'Zutaten und Schritte gehen mit. Tage, an denen es schon eingeplant ist, behalten den Namen.',
			keep: 'Doch behalten'
		},

		form: {
			new: 'Neues Rezept',
			edit: 'Rezept bearbeiten',
			editTitle: (name: string) => `${name} bearbeiten`,
			photo: 'Rezeptfoto',
			changePhoto: 'Foto ändern',
			addPhoto: 'Foto hinzufügen',
			removePhoto: 'Foto entfernen',
			name: 'Rezeptname',
			namePlaceholder: 'Cremige Pilzpasta',
			time: 'Dauer (Min.)',
			servingsLabel: 'Portionen',
			ingredients: 'Zutaten',
			ingredientPlaceholder: '400 g Nudeln',
			ingredientLabel: (index: number) => `Zutat ${index}`,
			addIngredient: 'Zutat hinzufügen',
			ingredientsNote: (units: string) =>
				`Schreib sie, wie du magst — „400 g Nudeln“, „2 Eier“, „Salz“. Bekannte Einheiten: ${units}. Tipp auf eine Menge, um Zahl und Einheit selbst zu wählen.`,
			amountLabel: (amount: string) =>
				amount ? `${amount} — bearbeiten` : 'Keine Menge — eintragen',
			ingredientNamePlaceholder: 'Nudeln',
			quantity: 'Menge',
			quantityPlaceholder: '400',
			unit: 'Einheit',
			unitNone: 'Ohne Einheit',
			unitHint: 'Wird nur mit einer Menge gespeichert',
			savedAsLead: 'Wird gespeichert als ',
			savedAsNothing: 'noch nichts',
			amountDone: 'Fertig',
			steps: 'Schritte',
			stepPlaceholder: 'Die Nudeln bissfest kochen, etwa 9 Min.',
			stepLabel: (index: number) => `Schritt ${index}`,
			addStep: 'Schritt hinzufügen',

			usesAuto: 'auto',
			usesNone: 'Zutaten für diesen Schritt',
			usesNothing: 'nichts',
			usesLabel: (index: number) => `Zutaten für Schritt ${index}`,
			usesTitle: 'Was dieser Schritt braucht',
			usesSubtitle: 'Der Kochmodus zeigt sie an, während du bei diesem Schritt bist.',
			usesShare: (amount: string) => `von ${amount}`,
			usesAmount: (name: string) => `Menge von ${name} für diesen Schritt`,
			usesAll: 'alles',
			usesBackToAuto: 'Lieber aus dem Text lesen',
			usesEmpty: 'Trag zuerst die Zutaten ein — dann kannst du sie den Schritten zuordnen.',

			timerAdd: 'Timer hinzufügen',
			timerLabel: (index: number) => `Timer für Schritt ${index}`,
			timerChip: (name: string, duration: string) => `${name} · ${duration}`,
			timerSheet: {
				title: 'Timer für den Schritt',
				eyebrow: (index: number) => `Schritt ${index}`,
				subtitle: 'Der Kochmodus bietet ihn bei diesem Schritt an, unter diesem Namen.',
				save: 'Timer speichern',
				remove: 'Timer entfernen'
			},
			save: 'Speichern',
			saveRecipe: 'Rezept speichern',
			moveIngredientUp: (index: number) => `Zutat ${index} nach oben`,
			moveIngredientDown: (index: number) => `Zutat ${index} nach unten`,
			removeIngredient: (index: number) => `Zutat ${index} entfernen`,
			moveStepUp: (index: number) => `Schritt ${index} nach oben`,
			moveStepDown: (index: number) => `Schritt ${index} nach unten`,
			removeStep: (index: number) => `Schritt ${index} entfernen`
		},

		pick: {
			eyebrow: 'Auf die Einkaufsliste',
			subtitle: 'Hak ab, was ihr noch braucht.',
			chosen: (count: number, total: number) => `${count} von ${total} ausgewählt`,
			all: 'Alle auswählen',
			none: 'Keine auswählen',
			have: (amount: string) => (amount ? `Steht schon drauf · ${amount}` : 'Steht schon drauf'),
			merge: (amount: string) => `Steht schon drauf — wird ${amount}`,
			staple: 'Habt ihr sonst immer da',
			submit: (count: number) =>
				count === 1 ? '1 auf die Liste' : `${count} auf die Liste setzen`,
			nothing: 'Nichts ausgewählt'
		},

		shoppingResult: {
			added: (count: number) =>
				count === 1 ? '1 Zutat auf der Einkaufsliste' : `${count} Zutaten auf der Einkaufsliste`,
			toppedUp: (count: number) =>
				count === 1 ? '1 Menge auf der Liste erhöht' : `${count} Mengen auf der Liste erhöht`,
			nothing: 'Alles steht schon auf der Liste',
			merged: (count: number) => (count === 1 ? '1 Menge erhöht' : `bei ${count} die Menge erhöht`),
			skipped: (count: number) =>
				count === 1 ? '1 stand schon drauf' : `${count} standen schon drauf`,
			openList: 'Liste öffnen'
		},

		cook: {
			title: (recipe: string) => `Kochen · ${recipe}`,
			setTimer: 'Timer stellen',
			close: 'Kochmodus schließen',
			step: (index: number, total: number) => `Schritt ${index} von ${total}`,
			startTimer: 'Timer stellen',
			startParsedTimer: (duration: string) => `${duration}-Timer starten`,
			startNamedTimer: (name: string, duration: string) => `${name} · ${duration} starten`,
			ingredients: 'Zutaten',
			usesLead: 'Dieser Schritt braucht ',
			previous: 'Vorheriger Schritt',
			next: 'Nächster Schritt',
			finish: 'Fertig',
			eyebrow: 'Kochmodus',
			noSteps:
				'Für dieses Rezept sind noch keine Schritte notiert — trag sie ein, dann führt dich der Kochmodus durch.',
			addSteps: 'Schritte eintragen',

			peekTitle: 'Zutaten',
			peekTitleServes: (servings: number) => `Zutaten · für ${servings}`,
			peekEmpty: 'Für dieses Rezept sind keine Zutaten notiert.',
			peekShare: (amount: string) => `von ${amount}`,
			stepAmount: (amount: string) => `, ${amount}, `,
			scaledFrom: (written: string) => ` (im Rezept: ${written})`,

			timerTitle: 'Timer stellen',
			timerSubtitle: 'Er klingelt, bis du ihn stoppst — auch bei gesperrtem Handy.',
			minutes: 'Minuten',
			startMinutes: (minutes: number) => `${minutes}-Minuten-Timer starten`,

			timerLabel: (label: string, state: string) => `${label}: ${state}`,
			timerDone: 'fertig',
			timerLeft: (remaining: string, total: string) => `${remaining} von ${total} übrig`,
			timerMeta: (label: string, total: string, paused: boolean) =>
				paused ? `${label} · ${total} · pausiert` : `${label} · ${total}`,
			dismiss: 'Stopp',
			resume: 'Weiter',
			pause: 'Pause',
			addMinute: '+1:00',
			cancel: 'Abbrechen',
			paused: '(pausiert)',
			barDone: (label: string) => `${label} ist fertig`,
			barRunning: (label: string, remaining: string) => `${label}, noch ${remaining}`,
			barBackTo: (step: number) => ` — zurück zu Schritt ${step}`,
			defaultTimer: 'Timer',
			timerForStep: (step: number) => `Schritt ${step}`,
			timerName: 'Wofür?',
			timerCancelOne: (label: string) => `${label} abbrechen`,
			timerCapped: (max: number) =>
				`${max} Timer gleichzeitig sind das Maximum — stopp zuerst einen.`,
			offline: 'Offline — der klingelt nur, solange die App offen ist.',
			timerFailed: 'Der Timer ließ sich nicht starten.'
		},

		dock: {
			running: (label: string, remaining: string) => `${label}, noch ${remaining}`,
			done: (label: string) => `${label} ist fertig`,
			backTo: ' — zurück zum Kochen',
			more: (count: number) => `+${count}`,
			/** „weiterer“/„weitere“: im Deutschen entscheidet die Zahl über die Endung. */
			andMore: (count: number) =>
				count === 1 ? ' und 1 weiterer Timer' : ` und ${count} weitere Timer`,
			dismiss: 'Diesen Timer stoppen'
		},

		import: {
			title: 'Rezept importieren',
			subtitle: 'Aus einem Link',
			back: 'Zurück zu den Rezepten',
			intro:
				'Füg einen Link zu einem Rezept ein — wir tragen Name, Foto, Zutaten und Schritte zum Prüfen ein.',
			urlLabel: 'Rezept-Link',
			urlPlaceholder: 'https://…',
			fetch: 'Rezept holen',
			fetching: 'Wird geholt…',
			manualLead: 'Kein Link? ',
			manualLink: 'Von Hand eintragen',
			manualRest: '.',

			error: {
				invalidUrl: 'Das sieht nicht nach einer Web-Adresse aus — füg den Link zum Rezept ein.',
				blocked: 'Dieser Link lässt sich von hier nicht öffnen. Nimm die öffentliche Web-Adresse.',
				unreachable: 'Die Seite war nicht erreichbar — prüf den Link und deine Verbindung.',
				refused:
					'Diese Seite lässt Apps ihre Rezepte nicht lesen. Öffne sie im Browser und kopier das Rezept von dort.',
				notHtml:
					'Dieser Link ist keine Webseite. Füg die Rezeptseite ein, keine Datei und kein Bild.',
				tooLarge: 'Die Seite ist zu groß zum Einlesen — versuch einen direkten Link zum Rezept.',
				noRecipe: 'Auf der Seite wurde kein Rezept gefunden.'
			},

			ai: {
				note: 'Mit KI erstellt — vor dem Speichern kurz prüfen.',
				adapted: (instructions: string) => `Angepasst: „${instructions}“.`,
				withoutAi: (reason: string) => `So übernommen, wie die Seite es schreibt — ${reason}`,
				improve: 'Mit KI verbessern',
				improveHint:
					'Ordnet Mengen, verknüpft Zutaten mit ihren Schritten und stellt Timer — und liest auch Seiten ohne Rezeptdaten. Nutzt deinen KI-Anbieter.',
				instructionsToggle: 'Anweisungen für die KI hinzufügen',
				instructionsLabel: 'Anweisungen für die KI',
				instructionsPlaceholder: 'z. B. mit Tofu statt Fleisch, für 2 Personen',
				instructionsHousehold: (instructions: string) => `Gilt immer: „${instructions}“`,
				pageLead: 'Diese Seite hat keine direkt lesbaren Rezeptdaten. Mit KI auslesen?',
				tryPage: 'Mit KI auslesen',
				extracting: 'Wird ausgelesen…',
				loading: [
					'Rezept wird gelesen…',
					'Zutaten werden abgemessen…',
					'Lass es köcheln…',
					'Wird angerichtet…'
				],
				pasteToggle: 'Stattdessen den Rezepttext einfügen',
				pasteLabel: 'Rezepttext',
				pastePlaceholder: 'Füg das ganze Rezept ein — Zutaten und Schritte.',
				pasteSubmit: 'Rezept auslesen',
				photoToggle: 'Aus einem Foto importieren',
				photoLabel: 'Fotos des Rezepts',
				photoHint: 'Bis zu 3 Fotos einer Kochbuch- oder Magazinseite.',
				photoSubmit: 'Aus Fotos auslesen',
				hintLead: 'Keine Rezeptdaten auf der Seite. ',
				hintLink: 'KI-Funktionen einrichten',
				hintRest: ', um es trotzdem auszulesen.',
				setupCopy:
					'Die KI-Funktionen sind noch nicht eingerichtet. Füg einen Schlüssel von Gemini, ChatGPT, Claude oder OpenRouter hinzu, um Rezepte aus Fotos und eingefügtem Text zu lesen.',
				setupCta: 'KI-Funktionen einrichten',
				usedBackup: (backup: string, main: string) =>
					`${main} konnte nicht antworten, darum hat dein Ersatz (${backup}) übernommen.`,
				error: {
					noRecipe:
						'Darin war kein Rezept zu finden — versuch klarere Fotos oder vollständigeren Text.',
					noPhotos: 'Füg mindestens ein Foto des Rezepts hinzu.'
				}
			}
		}
	},

	/* ── Expenses [9a]–[9g] (→ SPEC §11) ───────────────────────────────────── */
	expenses: {
		title: 'Ausgaben',
		menu: {
			label: 'Mehr',
			allActivity: 'Alle Einträge',
			settings: 'Einstellungen für Ausgaben',
			recurring: 'Wiederkehrend'
		},
		money: (minor: number, currency: string) => formatMoney(minor, currency, INTL_LOCALE[L]),
		/** The currency's mark beside the amount field [9b]. */
		symbol: (currency: string) => currencySymbol(currency, INTL_LOCALE[L]),
		/** Whether amounts are typed back as "24,50" rather than "24.50". */
		decimalComma: true,

		balance: {
			owed: 'Du bekommst',
			owe: 'Du schuldest',
			settled: 'Alles ausgeglichen',
			settledDetail: 'Niemand schuldet jemandem etwas.',
			line: (from: string | null, to: string | null) => `${from ?? 'Du'} → ${to ?? 'dir'}`,
			settleUp: 'Ausgleichen',
			/** The button, read out with the line it settles. */
			settleLabel: (action: string, line: string) => `${action}: ${line}`,
			lineLabel: (from: string | null, to: string | null, amount: string) =>
				from === null
					? `Du zahlst ${to} ${amount}`
					: to === null
						? `${from} zahlt dir ${amount}`
						: `${from} zahlt ${to} ${amount}`
		},

		recent: 'Zuletzt',
		allActivity: 'Alle Einträge',
		add: 'Ausgabe hinzufügen',

		row: {
			paid: (who: string | null, amount: string) =>
				who === null ? `Du hast ${amount} bezahlt` : `${who} hat ${amount} bezahlt`,
			lent: 'ausgelegt',
			borrowed: 'dein Anteil',
			notInvolved: 'nicht beteiligt',
			justYou: 'nur du',
			payment: (from: string | null, to: string | null, amount: string) =>
				from === null
					? `Du hast ${to} ${amount} gezahlt`
					: `${from} hat ${to ?? 'dir'} ${amount} gezahlt`,
			paymentMeta: (when: string) => `Zahlung · ${when}`,
			paymentPlain: 'Zahlung',
			repeats: 'Wiederholt sich'
		},

		empty: {
			title: 'Noch nichts zu teilen',
			copy: 'Trag den Wocheneinkauf ein, die Miete, die Pizza. Choreganized rechnet mit.',
			add: 'Ausgabe eintragen'
		},

		form: {
			new: 'Ausgabe hinzufügen',
			edit: 'Ausgabe bearbeiten',
			amount: 'Betrag',
			whatFor: 'Wofür?',
			whatForPlaceholder: 'Wocheneinkauf, Miete, Pizza …',
			suggestions: 'Frühere Ausgaben',
			category: 'Kategorie',
			paidBy: 'Bezahlt von',
			you: 'du',
			split: 'Aufteilung',
			date: 'Datum',
			today: 'Heute',
			save: 'Speichern',
			delete: 'Ausgabe löschen',
			repeats: 'Wiederholen',
			never: 'Nie',
			repeat: (unit: RepeatUnit, interval: number) => {
				if (interval === 1) {
					return unit === 'week' ? 'Wöchentlich' : unit === 'month' ? 'Monatlich' : 'Jährlich';
				}
				if (unit === 'month' && interval === 3) return 'Vierteljährlich';
				const plural = unit === 'week' ? 'Wochen' : unit === 'month' ? 'Monate' : 'Jahre';
				return `Alle ${interval} ${plural}`;
			},
			repeatCustom: 'Eigener Rhythmus…',
			every: 'Alle',
			unit: 'Einheit',
			units: (unit: RepeatUnit, count: number) =>
				unit === 'week'
					? count === 1
						? 'Woche'
						: 'Wochen'
					: unit === 'month'
						? count === 1
							? 'Monat'
							: 'Monate'
						: count === 1
							? 'Jahr'
							: 'Jahre',
			editSeries: 'Serie bearbeiten',
			nextOne: 'Nächstes Mal'
		},

		summary: {
			everyone: 'alle',
			people: (count: number) => (count === 1 ? '1 Person' : `${count} Personen`),
			equal: (who: string, each: string) => `Gleich · ${who} · je ${each}`,
			amounts: (who: string) => `Beträge · ${who}`,
			parts: (parts: { name: string; value: string }[]) =>
				parts.map(({ name, value }) => `${name} ${value}`).join(' · '),
			percent: (parts: string) => `Nach % · ${parts}`,
			shares: (parts: string) => `Nach Anteilen · ${parts}`,
			invalid: 'Geht noch nicht auf'
		},

		split: {
			title: 'Aufteilung',
			defaultTitle: 'Standard-Aufteilung',
			subtitle: (amount: string, what: string) => (what ? `${amount} · ${what}` : amount),
			mode: 'Wie aufteilen',
			modes: {
				equal: 'Gleich',
				amounts: 'Beträge',
				percent: '%',
				shares: 'Anteile'
			},
			paid: 'bezahlt',
			notIn: 'nicht dabei',
			include: (name: string) => `${name} ist dabei`,
			input: (name: string) => `Teil von ${name}`,
			left: (amount: string) => `${amount} noch offen`,
			over: (amount: string) => `${amount} zu viel`,
			ofTotal: (sum: string, total: string) => `${sum} von ${total}`,
			addsUp: 'Geht auf',
			percentOk: 'Ergibt 100 %',
			percentLeft: (percent: string) => `${percent} % noch offen`,
			percentOver: (percent: string) => `${percent} % zu viel`,
			sharesTotal: (count: number) =>
				count === 1 ? '1 Anteil insgesamt' : `${count} Anteile insgesamt`,
			nobody: 'Wähl mindestens eine Person.',
			done: 'Fertig',
			makeDefault: 'Als Standard für den Haushalt',
			defaultSaved: (parts: string) => `Neue Ausgaben starten mit ${parts}.`,
			defaultEqual: 'Neue Ausgaben werden gleich auf alle aufgeteilt.',
			notInDefault: (name: string) => `${name} ist nicht Teil der Standard-Aufteilung.`
		},

		settle: {
			title: 'Ausgleichen',
			edit: 'Zahlung bearbeiten',
			from: 'Von',
			to: 'An',
			swap: 'Tauschen',
			owes: (from: string | null, to: string | null, amount: string) =>
				`${from === null ? `Du schuldest ${to}` : `${from} schuldet ${to ?? 'dir'}`} ${amount} · für eine Teilzahlung einfach weniger eintragen`,
			record: 'Zahlung eintragen',
			delete: 'Zahlung löschen',
			note: 'Das trägt sie nur ein — das Geld schickst du, wie ihr es immer macht.'
		},

		detail: {
			back: 'Zurück zu den Ausgaben',
			edit: 'Bearbeiten',
			payment: 'Zahlung',
			meta: (category: string, date: string) => `${category} · ${date}`,
			/** "Monday, Oct 26" — the weekday and the date, joined the language's way. */
			dateLine: (weekday: string, date: string) => `${weekday}, ${date}`,
			/** "Added by Lukas · Oct 26, 19:00" — a day and a clock time. */
			stamp: (day: string, time: string) => `${day}, ${time}`,
			paidBy: 'Bezahlt von',
			shares: (how: string) => `Anteile · ${how}`,
			how: {
				equal: 'gleich aufgeteilt',
				amounts: 'nach Beträgen',
				percent: 'nach %',
				shares: 'nach Anteilen'
			},
			you: 'du',
			formerMember: 'Ehemaliges Mitglied',
			owesFor: (who: string | null, payer: string | null, amount: string) =>
				who === null
					? `du schuldest ${payer} dafür ${amount}`
					: `schuldet ${payer ?? 'dir'} dafür ${amount}`,
			added: (who: string, when: string) => `Eingetragen von ${who} · ${when}`,
			edited: (who: string, when: string) => `Bearbeitet von ${who} · ${when}`,
			someone: 'jemandem',
			repeats: (cadence: string) =>
				`Wiederholt sich ${cadence.charAt(0).toLowerCase()}${cadence.slice(1)}`,
			editSeries: 'Serie bearbeiten'
		},

		recurring: {
			title: 'Wiederkehrend',
			back: 'Zurück zu den Ausgaben',
			intro:
				'Jede wird an ihrem Tag um 6:00 als normale Ausgabe eingetragen. Änderungen hier gelten nur für die kommenden.',
			schedule: (cadence: string, next: string) => `${cadence} · als Nächstes ${next}`,
			summary: (amount: string, rule: string, pays: string) => `${amount} · ${rule} · ${pays}`,
			rule: {
				week: (weekday: string, interval: number) =>
					interval === 1 ? `Jeden ${weekday}` : `Alle ${interval} Wochen am ${weekday}`,
				month: (day: number, interval: number) =>
					interval === 1
						? `Monatlich am ${day}.`
						: interval === 3
							? `Vierteljährlich am ${day}.`
							: `Alle ${interval} Monate am ${day}.`,
				year: (date: string, interval: number) =>
					interval === 1 ? `Jährlich am ${date}` : `Alle ${interval} Jahre am ${date}`
			},
			pays: (who: string | null) => (who === null ? 'du zahlst' : `${who} zahlt`),
			nextOne: 'Nächstes Mal',
			editSeries: 'Serie bearbeiten',
			editSeriesDetail: 'Nur die kommenden',
			stop: 'Nicht mehr wiederholen',
			stopDetail: (count: number) =>
				count === 0
					? 'Bisher wurde noch keine eingetragen'
					: count === 1
						? 'Die eine schon eingetragene bleibt, wie sie ist'
						: `Die ${count} schon eingetragenen bleiben, wie sie sind`,
			empty: 'Noch nichts Wiederkehrendes',
			emptyCopy:
				'Miete, Abos, Internet: Leg es hier an oder wähl bei einer Ausgabe „Wiederholen“, dann trägt es sich von selbst ein.',
			add: 'Neue wiederkehrende Ausgabe'
		},

		history: {
			title: 'Alle Einträge',
			back: 'Zurück zu den Ausgaben',
			search: 'Beschreibungen durchsuchen',
			filters: 'Filter',
			allFilters: 'Alle Filter',
			clearAll: 'Zurücksetzen',
			clear: (filter: string) => `${filter} entfernen`,
			time: 'Zeitraum',
			ranges: {
				all: 'Gesamter Zeitraum',
				thisMonth: 'Dieser Monat',
				lastMonth: 'Letzter Monat',
				last3Months: 'Letzte 3 Monate',
				thisYear: 'Dieses Jahr',
				custom: 'Daten wählen …'
			},
			rangeHint: (covers: string | null, byDay: boolean) =>
				covers
					? `${covers} · ${byDay ? 'nach Tag gruppiert' : 'nach Monat gruppiert'}`
					: byDay
						? 'Nach Tag gruppiert'
						: 'Nach Monat gruppiert',
			customRange: (from: string | null, to: string | null) =>
				from && to ? `${from} – ${to}` : from ? `Ab ${from}` : `Bis ${to}`,
			from: 'Von',
			to: 'Bis',
			apply: 'Übernehmen',
			paidBy: 'Bezahlt von',
			paidByHint: 'Wer es bezahlt hat.',
			anyPayer: 'Alle Personen',
			you: 'Du',
			paidByChip: (name: string | null) => (name ? `Von ${name} bezahlt` : 'Von dir bezahlt'),
			category: 'Kategorie',
			allCategories: 'Alle Kategorien',
			paymentsOnly: 'Nur Zahlungen',
			entries: (count: number) => (count === 1 ? '1 Eintrag' : `${count} Einträge`),
			expenses: (count: number) => (count === 1 ? '1 Ausgabe' : `${count} Ausgaben`),
			payments: (count: number) => (count === 1 ? '1 Zahlung' : `${count} Zahlungen`),
			show: (counted: string) => `${counted} anzeigen`,
			spent: (amount: string) => `${amount} ausgegeben`,
			load: (month: string) => `${month} laden`,
			empty: 'Nichts gefunden',
			emptyCopy: 'Versuch ein anderes Wort oder weniger Filter.'
		},

		categories: {
			groceries: 'Lebensmittel',
			household: 'Haushalt',
			bills: 'Miete & Rechnungen',
			eatingOut: 'Auswärts essen',
			transport: 'Unterwegs',
			leisure: 'Freizeit',
			travel: 'Reisen',
			other: 'Sonstiges'
		},

		undo: {
			deleted: (what: string): RichText => [{ text: what, strong: true }, { text: ' gelöscht' }],
			payment: 'Zahlung',
			action: 'Rückgängig'
		},

		settings: {
			row: 'Ausgaben',
			title: 'Ausgaben',
			currency: 'Währung',
			currencyLocked:
				'Wird einmal festgelegt, vor der ersten Ausgabe — später würde sie jeden Betrag umbenennen.',
			ownerOnly: 'Nur der Eigentümer kann die Währung ändern.',
			defaultSplit: 'Standard-Aufteilung',
			equalEveryone: 'Gleich auf alle',
			saved: 'Gespeichert'
		},

		home: {
			owed: (amount: string, from: string): RichText => [
				{ text: 'Du bekommst ' },
				{ text: amount, strong: true },
				{ text: ` · ${from}` }
			],
			owe: (to: string, amount: string): RichText => [
				{ text: `Du schuldest ${to} ` },
				{ text: amount, strong: true }
			]
		},

		leaveSeries: (names: string[]) => {
			const shown =
				names.length > 3 ? [...names.slice(0, 2), `${names.length - 2} weitere`] : names;
			return `${list(shown)} ${names.length === 1 ? 'wiederholt' : 'wiederholen'} sich dann nicht mehr.`;
		},

		leaveBalance: (who: string | null, owes: boolean, amount: string) =>
			who === null
				? owes
					? `Du schuldest noch ${amount} — vorher ausgleichen?`
					: `Du bekommst noch ${amount} — vorher ausgleichen?`
				: owes
					? `${who} schuldet noch ${amount} — vorher ausgleichen?`
					: `${who} bekommt noch ${amount} — vorher ausgleichen?`,

		errors: {
			amount: 'Gib einen Betrag über 0 ein.',
			description: 'Schreib dazu, wofür.',
			date: 'Das Datum darf nicht in der Zukunft liegen.',
			person: 'Jemand hier gehört nicht zum Haushalt.',
			split: 'Die Aufteilung geht nicht auf.',
			samePerson: 'Wähl zwei verschiedene Personen.',
			notFound: 'Diese Ausgabe gibt es nicht mehr.',
			currency: 'Wähl eine der angebotenen Währungen.',
			currencyLocked: 'Die Währung steht fest, sobald es Ausgaben gibt.',
			nextDate: 'Das nächste Mal kann nicht vor heute liegen.'
		}
	},

	/* ── Settings [6a] [6b] [6c] [6d] ──────────────────────────────────────── */
	settings: {
		title: 'Einstellungen',

		account: 'Konto',
		notifications: 'Benachrichtigungen',
		thisDevice: 'Dieses Gerät',
		awayMode: 'Abwesenheit',
		household: 'Haushalt',

		displayName: 'Anzeigename',
		members: 'Mitglieder',

		language: {
			row: 'Sprache',
			title: 'Sprache',
			system: 'System',
			systemDetail: (detected: string) => `Diesem Gerät folgen — zurzeit ${detected}`,
			note: 'Beim Sprachwechsel lädt die App neu.'
		},

		theme: {
			row: 'Erscheinungsbild',
			title: 'Erscheinungsbild',
			system: 'System',
			systemDetail: (detected: string) => `Diesem Gerät folgen — zurzeit ${detected}`,
			light: 'Hell',
			dark: 'Dunkel',
			note: 'Das merkt sich dieses Gerät — Handy und Laptop dürfen sich unterscheiden.'
		},

		prefs: {
			taskReminders: 'Aufgaben-Erinnerungen',
			taskRemindersDetail: 'Am Morgen, an dem eine deiner Aufgaben fällig ist',
			overdueNudges: 'Überfällig-Hinweise',
			overdueNudgesDetail: 'Ein Hinweis am Morgen danach',
			shoppingUpdates: 'Einkaufsliste',
			shoppingUpdatesDetail: 'Wenn jemand etwas auf die Liste setzt',
			shopClosures: 'Einkaufen vor Feiertagen',
			shopClosuresDetail: 'Ein paar Tage bevor ein Feiertag die Geschäfte zusperrt',
			expenses: 'Ausgaben',
			expensesDetail: 'Wenn eine Ausgabe dich betrifft',
			note: 'Das gilt auf jedem Gerät, das du unten einschaltest.'
		},

		test: {
			send: 'Testbenachrichtigung senden',
			sending: 'Wird gesendet…',
			notConfigured: 'Push ist auf dem Server noch nicht eingerichtet.',
			noDevice: 'Noch kein Gerät angemeldet — schalte es oben ein.',
			sentOne: 'An dieses Gerät geschickt — sollte gleich ankommen.',
			sentMany: (count: number) => `An ${count} Geräte geschickt — sollten gleich ankommen.`
		},

		signOut: 'Abmelden',
		signingOut: 'Wird abgemeldet…',
		signOutFailed: 'Abmelden hat nicht geklappt — prüf die Verbindung und versuch es nochmal.',

		profile: {
			title: 'Dein Profil',
			eyebrow: 'Konto'
		},

		householdName: {
			title: 'Name des Haushalts',
			eyebrow: 'Haushalt',
			placeholder: 'Sonnengasse 12',
			note: 'Alle im Haus sehen diesen Namen.'
		},

		ai: {
			row: 'KI-Funktionen',
			notSet: 'Nicht eingerichtet',
			value: (provider: string, model: string) => `${provider} · ${model}`,
			title: 'KI-Funktionen',
			eyebrow: 'Haushalt',
			what: 'Bring einen Schlüssel eines KI-Anbieters mit, um Rezepte aus Fotos, eingefügtem Text und Seiten ohne Rezeptdaten zu importieren.',
			freeNote:
				'Ein Gratis-Kontingent (Gemini oder die Gratis-Modelle von OpenRouter) reicht für einen Haushalt — aber Gratis-Kontingente sind begrenzt und antworten manchmal eine Zeit lang nicht. Ein Ersatz hält die Importe dann am Laufen.',
			primary: 'Haupt-Anbieter',
			backup: 'Ersatz',
			backupEmpty: 'Springt ein, wenn der Haupt-Anbieter am Limit oder nicht erreichbar ist.',
			setUp: 'Einrichten',
			addBackup: 'Ersatz hinzufügen',
			edit: 'Bearbeiten',
			remove: 'Entfernen',
			keyHint: (hint: string) => `Schlüssel ${hint}`,
			back: 'Zurück',

			connection: {
				titlePrimary: 'Haupt-Anbieter',
				titleBackup: 'Ersatz-Anbieter',
				provider: 'Anbieter',
				getKey: (provider: string) => `${provider}-Schlüssel holen`,
				keyLabel: 'API-Schlüssel',
				keyPlaceholder: 'Schlüssel einfügen',
				keyKeep: (hint: string) => `Leer lassen, um ${hint} zu behalten.`,
				invalidKey: 'Das sieht nicht nach einem API-Schlüssel aus — füg den ganzen Schlüssel ein.',
				loadModels: 'Modelle laden',
				loadingModels: 'Modelle werden geladen…',
				modelLabel: 'Modell',
				modelsHint:
					'Direkt aus der Liste des Anbieters — neue Modelle tauchen auf, sobald es sie gibt.',
				recommended: (label: string) => `${label} (empfohlen)`,
				free: (label: string) => `${label} · gratis`,
				otherModel: 'Anderes Modell…',
				modelIdLabel: 'Modell-ID',
				modelIdPlaceholder: 'z. B. gemini-flash-latest',
				invalidModel: 'Schreib die Modell-ID genau so, wie der Anbieter sie schreibt.',
				needKey: 'Füg einen Schlüssel ein, um die Modelle zu sehen.',
				save: 'Speichern',
				saving: 'Wird gespeichert…'
			},

			test: {
				label: 'Verbindung testen',
				testing: 'Wird getestet…',
				ok: 'Verbindung funktioniert.'
			},

			instructions: {
				label: 'Anweisungen für den Haushalt',
				hint: 'Gelten für jeden KI-Import, zusätzlich zu dem, was du bei einem Rezept eintippst.',
				placeholder: 'z. B. wir essen vegetarisch; metrische Einheiten',
				save: 'Anweisungen speichern',
				saved: 'Gespeichert.'
			}
		},

		wording: {
			row: 'Wortwahl in Rezepten',
			title: 'Wortwahl in Rezepten',
			asWritten: 'Wie geschrieben',
			asWrittenDetail: 'Importierte Rezepte behalten die Wörter der Seite.',
			austrian: 'Österreichisch',
			austrianDetail:
				'Aus Sahne wird Obers, aus Quark Topfen, aus Kartoffeln Erdäpfel — in importierten deutschen Rezepten.',
			note: 'Gilt für Rezepte, die du ab jetzt importierst; gespeicherte bleiben, wie sie sind. Mit KI wird das ganze Rezept umgeschrieben, ohne die Namen der Zutaten.'
		},

		about: 'Über die App',
		version: {
			row: 'Version',
			copied: 'Kopiert'
		},

		feedback: {
			row: 'Feedback senden',
			title: 'Feedback senden',
			eyebrow: 'Choreganized',
			kindLabel: 'Art des Feedbacks',
			bug: 'Etwas ist kaputt',
			idea: 'Eine Idee',
			label: 'Deine Nachricht',
			bugPlaceholder: 'Was ist passiert, und was hättest du stattdessen erwartet?',
			ideaPlaceholder: 'Was soll die App können?',
			send: 'Senden',
			sending: 'Wird gesendet…',
			attached: (version: string) =>
				`Deine Worte landen auf einer öffentlichen Liste auf GitHub, dazu die App-Version (${version}), deine Sprache und das Erscheinungsbild. Dein Name und dein Browser bleiben in der App — sie werden nicht veröffentlicht. Schreib in der Sprache, die dir liegt.`,
			pickKind: 'Wähl einen Fehler oder eine Idee.',
			empty: 'Schreib erst ein, zwei Zeilen.',
			thanks: 'Danke — gespeichert und auf dem Weg zu Lukas.'
		},

		leave: {
			label: 'Haushalt verlassen',
			blockedTitle: 'Übergib das Haus zuerst',
			blockedCopy: (household: string) =>
				`Du bist Besitzer:in von ${household}, und jemand muss Mitglieder und Einladung verwalten können. Mach jemand anderen zur Besitzer:in, dann kannst du gehen.`,
			goToMembers: 'Zu den Mitgliedern',
			title: (household: string) => `${household} verlassen?`,
			lastCopy: (household: string) =>
				`Du bist die einzige Person hier — wenn du gehst, wird ${household} endgültig gelöscht: Einkaufsliste, Essensplan, alle Aufgaben und sämtliche Punkte. Das lässt sich nicht rückgängig machen.`,
			copy: 'Du verlierst den Zugriff auf Einkaufsliste, Aufgaben und Essensplan. Deine Punkte bleiben beim Haushalt.',
			deleteAndLeave: 'Haushalt löschen & gehen',
			failed: 'Das hat nicht geklappt. Versuch es nochmal.'
		},

		roster: {
			title: 'Mitglieder',
			back: 'Zurück zu den Einstellungen',
			you: '(du)',
			owner: 'Besitzer:in',
			joined: (date: string) => `Dabei seit ${date}`,
			memberJoined: (date: string) => `Mitglied · dabei seit ${date}`,
			manage: (name: string) => `${name} verwalten`,
			pendingInvite: 'Offene Einladung',
			noInvite: 'Keine Einladung aktiv',
			code: (code: string) => `Code ${code}`,
			nobodyCanJoin: 'Niemand kann mit einem Code beitreten',
			revoke: 'Zurückziehen',
			newCode: 'Neuer Code',
			invite: 'Mitbewohner:in einladen',
			helpOwner:
				'Als Besitzer:in kannst du Rollen ändern oder Mitglieder entfernen. Alle anderen sehen diese Liste und können selbst gehen.',
			helpMember:
				'Die Besitzer:in ändert Rollen und entfernt Mitglieder. Du kannst Leute einladen und in den Einstellungen selbst gehen.'
		},

		manage: {
			meta: (joined: string, points: number) =>
				`Mitglied · dabei seit ${joined} · ${points} Pkt. diesen Monat`,
			makeOwner: 'Zur Besitzer:in machen',
			makeOwnerDetail: 'Kann dann auch Mitglieder verwalten',
			remove: 'Aus dem Haushalt entfernen',
			removeDetail: 'Verliert den Zugriff · Punkte bleiben im Haus',
			removeLabel: 'Mitglied entfernen',
			removeConfirm: (name: string) => `${name} entfernen?`,
			removeCopy:
				'Der Zugriff auf Einkaufsliste, Aufgaben und Essensplan ist sofort weg. Zugewiesene Aufgaben sind danach für alle offen, und alle Punkte bleiben im Haus.',
			ownerConfirm: (name: string) => `${name} zur Besitzer:in machen?`,
			ownerCopy:
				'Die Person kann dann den Haushalt umbenennen, die Einladung verwalten und Mitglieder entfernen — auch dich. Du bleibst Mitglied im Haus.',
			failed: 'Das hat nicht geklappt.'
		}
	},

	/* ── Sign in [5a] and onboarding [5b]–[5e] ─────────────────────────────── */
	auth: {
		signIn: 'Anmelden',
		/** Der Wortmarke bleibt englisch — sie ist der Produktname. */
		wordmarkLead: 'Chore',
		wordmarkAccent: 'ganized',
		tagline: 'Every chore, organized',
		continueWithGoogle: 'Weiter mit Google',
		openingGoogle: 'Google wird geöffnet…',
		failed: 'Die Anmeldung ist nicht durchgegangen. Versuch es nochmal.',
		footnote: 'Neu hier? Mit der Google-Anmeldung wird dein Konto angelegt.',
		footnoteEmail: 'Neu hier? Mit der Anmeldung wird dein Konto angelegt.',
		redirecting: 'Weiter zu Choreganized…',

		email: 'E-Mail',
		emailPlaceholder: 'du@beispiel.at',
		sendCode: 'Anmeldecode anfordern',
		sendingCode: 'Wird gesendet…',
		codeSent: (email: string, minutes: number) =>
			`Wir haben einen 6-stelligen Code an ${email} geschickt. Er gilt ${minutes} Minuten.`,
		code: 'Code',
		verifyCode: 'Anmelden',
		verifyingCode: 'Anmeldung läuft…',
		noCode: 'Keinen Code bekommen?',
		resendCode: 'Nochmal schicken',
		resendIn: (seconds: number) =>
			`Nochmal schicken in ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`,
		codeCooldown: (seconds: number) =>
			`Warte ${seconds} ${seconds === 1 ? 'Sekunde' : 'Sekunden'}, bevor du einen neuen Code anforderst.`,
		codeHourlyLimit: (minutes: number) =>
			`Für diese Adresse wurden gerade genug Codes verschickt. Versuch es in ${minutes} ${minutes === 1 ? 'Minute' : 'Minuten'} nochmal oder melde dich mit Google an.`,
		codeResent: (email: string, minutes: number) =>
			`Wir haben einen neuen Code an ${email} geschickt. Er gilt ${minutes} Minuten, der alte nicht mehr.`,
		changeEmail: 'Andere E-Mail verwenden',
		or: 'oder',
		invalidEmail: 'Gib eine gültige E-Mail-Adresse ein.',
		wrongCode: 'Der Code stimmt nicht. Schau nochmal in die E-Mail.',
		codeExpired: 'Der Code ist abgelaufen. Schick dir einen neuen.',
		tooManyAttempts: 'Zu viele Versuche mit diesem Code. Schick dir einen neuen.',
		tooManyRequests: 'Zu viele Versuche. Warte eine Minute und versuch es dann nochmal.',
		sendFailed:
			'Die E-Mail konnte nicht gesendet werden, es ist also kein Code unterwegs. Versuch es gleich nochmal oder melde dich mit Google an.',

		mail: {
			subject: (code: string) => `${code} ist dein Choreganized-Code`,
			body: (code: string, minutes: number) =>
				`Dein Anmeldecode für Choreganized:\n\n${code}\n\nEr gilt ${minutes} Minuten. Wenn du ihn nicht angefordert hast, kannst du diese E-Mail ignorieren – ohne den Code kann sich niemand anmelden.`
		}
	},

	onboarding: {
		step: (step: number, total: number) => `Schritt ${step} von ${total}`,
		backToStart: 'Zurück zum Anfang',

		start: {
			title: 'Los geht’s',
			welcome: (name: string) => (name ? `Willkommen, ${name}` : 'Willkommen'),
			question: 'Wie möchtest du starten?',
			createTitle: 'Haushalt anlegen',
			createCopy: 'Frisch anfangen und die Leute einladen, mit denen du wohnst.',
			joinTitle: 'Haushalt beitreten',
			joinCopy: 'Einladungslink oder Code da? Hier eintragen.',
			continue: 'Weiter',
			signedInAs: (email) => `Angemeldet als ${email}`,
			switchAccount: 'Anderes Konto verwenden',
			switchingAccount: 'Wird abgemeldet…',
			switchFailed: 'Abmelden hat nicht geklappt — prüf die Verbindung und versuch es nochmal.'
		},

		create: {
			title: 'Richte dein Zuhause ein',
			householdName: 'Name des Haushalts',
			householdPlaceholder: 'Sonnengasse 12',
			displayName: 'Dein Anzeigename'
		},

		invite: {
			title: 'Lade deine Mitbewohner:innen ein',
			titleLead: 'Lade deine',
			titleRest: 'Mitbewohner:innen ein',
			sub: 'Ihr teilt dann Einkaufsliste, Aufgaben und Essensplan.',
			backToMembers: 'Zurück zu den Mitgliedern',
			code: 'Einladungscode',
			copy: 'Kopieren',
			copied: 'Kopiert',
			share: 'Einladung teilen',
			shareText: (household: string) => `Komm zu ${household} auf Choreganized`,
			revoked:
				'Dieser Haushalt hat gerade keinen aktiven Einladungscode. Die Besitzer:in kann unter Einstellungen → Mitglieder einen neuen anlegen.',
			members: 'Mitglieder',
			waiting: 'Warten, dass jemand dazukommt…',
			done: 'Fertig',
			moveIn: 'Einziehen'
		},

		join: {
			title: 'Haushalt beitreten',
			profileTitle: 'Richte dein Profil ein',
			differentCode: 'Anderen Code eingeben',
			code: 'Einladungscode',
			submit: 'Beitreten',
			badCode: 'Zu diesem Code gibt es keinen Haushalt. Frag nach, wer dich eingeladen hat.',
			nameTooLong: (max: number) => `Dein Name darf höchstens ${max} Zeichen haben.`
		},

		landing: {
			invited: 'Du bist eingeladen',
			notFound: 'Einladung nicht gefunden',
			copy: 'Ihr teilt dann Einkaufsliste, Essensplan und Aufgaben. Melde dich mit Google an, um beizutreten.',
			gone: 'Dieser Einladungslink gilt nicht mehr — der Code wurde vielleicht ersetzt oder zurückgezogen. Frag nach einem neuen.',
			accept: 'Einladung annehmen',
			goToSignIn: 'Zur Anmeldung',
			invitedBy: 'lädt dich ein zu',
			invitedTo: 'Du wurdest eingeladen zu'
		}
	},

	/* ── The two one-time offers on Home [8b] ──────────────────────────────── */
	enablePush: {
		row: 'Auf diesem Gerät aktivieren',
		toggle: 'Benachrichtigungen auf diesem Gerät aktivieren',
		unavailable: 'Nicht verfügbar',
		promptTitle: 'Benachrichtigungen einschalten',
		promptDetail: 'Ein Hinweis am Morgen, wenn etwas fällig ist. Sonst nichts.',
		enable: 'Einschalten',
		enabling: 'Wird eingeschaltet…',
		notNow: 'Jetzt nicht',
		unsupported:
			'Dieser Browser kann keine Benachrichtigungen zeigen. Auf dem iPhone: leg Choreganized zuerst auf den Home-Bildschirm.',
		unconfigured: 'Push ist auf dem Server noch nicht eingerichtet.',
		denied:
			'Benachrichtigungen sind für Choreganized blockiert. Schalte sie in den Website-Einstellungen des Browsers wieder ein.',
		perDevice: 'Jedes Handy und jeder Laptop muss einzeln eingeschaltet werden.',
		subscribed:
			'Aufgaben-Erinnerungen und Einkaufs-Updates kommen hier an, auch wenn die App zu ist.',
		failed: 'Da ist etwas schiefgegangen.'
	},

	install: {
		title: 'Zum Home-Bildschirm hinzufügen',
		detail: 'Installiere Choreganized für Vollbild mit einem Tipp.',
		add: 'Hinzufügen',
		opening: 'Wird geöffnet…',
		notNow: 'Jetzt nicht'
	},

	/* ── Geschäfte zu [Home, Einkaufen] ────────────────────────────────────── */
	holiday: {
		names: (keys: HolidayKey[]) => list(keys.map((key) => HOLIDAYS[key])),

		closed: (closureDate: CalendarDate, closedDays: number) =>
			closedDays === 1
				? `Am ${formatWeekdayLong(closureDate, L)} sind die Geschäfte zu`
				: `Die Geschäfte sind ${closedDays} Tage zu`,

		/** "Nationalfeiertag · letzter Einkaufstag ist Samstag". */
		detail: (holidays: string, lastOpenDay: CalendarDate, today: CalendarDate) =>
			`${holidays} · letzter Einkaufstag ist ${shoppingDay(lastOpenDay, today)}`,

		lastCall: 'Letzte Gelegenheit zum Einkaufen',
		lastCallDetail: (holidays: string, closedDays: number) =>
			closedDays === 1
				? `${holidays} · morgen geschlossen`
				: `${holidays} · ab morgen ${closedDays} Tage geschlossen`,

		remindTomorrow: 'Morgen erinnern',
		dismiss: 'Alles klar'
	},

	/* ── Notifications ─────────────────────────────────────────────────────── */
	push: {
		shoppingAdd: (member: string, count: number) =>
			count === 1
				? `🛒 ${member} hat 1 Sache auf die Liste gesetzt`
				: `🛒 ${member} hat ${count} Sachen auf die Liste gesetzt`,
		shoppingToppedUp: (member: string, count: number) =>
			count === 1
				? `🛒 ${member} braucht mehr von 1 Sache auf der Liste`
				: `🛒 ${member} braucht mehr von ${count} Sachen auf der Liste`,

		taskDue: (emoji: string, task: string, assigned: boolean) =>
			`${emoji} ${task} ist heute fällig — ${assigned ? 'du bist dran' : 'kann jemand übernehmen'}`,
		taskOverdue: (emoji: string, task: string, assigned: boolean) =>
			`${emoji} ${task} ist überfällig — ${assigned ? 'du bist dran' : 'kann jemand übernehmen'}`,

		shopsClosed: (holidays: string, closedDays: number) =>
			closedDays === 1
				? `🛍️ ${holidays} — die Geschäfte haben zu`
				: `🛍️ ${holidays} — die Geschäfte haben ${closedDays} Tage zu`,
		shopsClosedBody: (lastOpenDay: CalendarDate, today: CalendarDate) =>
			`Letzter Einkaufstag ist ${shoppingDay(lastOpenDay, today)}.`,

		testTitle: '🔔 Benachrichtigungen sind an',
		testBody: 'So sieht ein Hinweis von Choreganized aus.',

		timerDone: (label: string) => `⏲️ ${label} ist fertig`,

		expenseAdded: (who: string, what: string, amount: string, share: string) =>
			`🧾 ${who} hat ${what} eingetragen · ${amount} · dein Anteil ${share}`,
		expenseChanged: (who: string, what: string, share: string) =>
			`🧾 ${who} hat ${what} geändert · dein Anteil ist jetzt ${share}`,
		paidYou: (who: string, amount: string) => `💸 ${who} hat dir ${amount} gezahlt`,
		expenseRepeated: (what: string, share: string) =>
			`🔁 ${what} wurde eingetragen · dein Anteil ${share}`
	},

	/* ── Refusals ──────────────────────────────────────────────────────────── */
	/* ── KI-Anbieter (→ plan 20) ───────────────────────────────────────────── */
	ai: {
		providers: {
			gemini: { name: 'Google Gemini', short: 'Gemini', hint: 'Mit Gratis-Kontingent' },
			openai: { name: 'ChatGPT (OpenAI)', short: 'OpenAI', hint: 'Kostenpflichtig, pro Nutzung' },
			anthropic: {
				name: 'Claude (Anthropic)',
				short: 'Claude',
				hint: 'Kostenpflichtig, pro Nutzung'
			},
			openrouter: {
				name: 'OpenRouter',
				short: 'OpenRouter',
				hint: 'Mit Gratis-Modellen · ein Schlüssel, viele Anbieter'
			}
		},

		error: {
			noKey: 'Richte zuerst die KI-Funktionen in den Einstellungen ein.',
			badKey: (provider: string) =>
				`${provider} hat den Schlüssel abgelehnt — prüf ihn in den Einstellungen.`,
			rateLimited: (provider: string) =>
				`${provider} ist gerade am Limit — kurz warten und nochmal versuchen, oder in den Einstellungen einen Ersatz hinzufügen.`,
			quota: (provider: string) =>
				`Bei ${provider} ist das Kontingent oder Guthaben aufgebraucht — später nochmal versuchen, oder in den Einstellungen einen Ersatz hinzufügen.`,
			modelUnavailable: (provider: string) =>
				`${provider} bietet dieses Modell (nicht mehr) an — wähl in den Einstellungen ein anderes.`,
			modelUnsupported: (provider: string) =>
				`Dieses ${provider}-Modell kann das nicht — vielleicht liest es keine Fotos. Wähl in den Einstellungen ein anderes.`,
			unavailable: (provider: string) =>
				`${provider} antwortet gerade nicht — versuch es gleich nochmal.`,
			timeout: (provider: string) =>
				`${provider} hat zu lange für die Antwort gebraucht — versuch es nochmal.`,
			badOutput: (provider: string) =>
				`${provider} hat geantwortet, aber nicht in einer Form, mit der die App etwas anfangen kann — nochmal versuchen, oder ein anderes Modell.`,
			failed: (provider: string) =>
				provider
					? `${provider} hat diesmal nicht geklappt — versuch es nochmal.`
					: 'Die KI hat diesmal nicht geklappt — versuch es nochmal.',
			backupFailed: (provider: string) => `Der Ersatz (${provider}) hat auch nicht geklappt.`
		}
	},

	errors: {
		keepUnder: (max: number) => `Höchstens ${max} Zeichen.`,

		notSignedIn: 'Nicht angemeldet',
		notInHousehold: 'In keinem Haushalt',
		notFound: 'Nicht gefunden',
		bodyTooLarge: 'Anfrage zu groß',
		expectedJson: 'JSON erwartet',
		noTopic: 'Kein Thema angegeben',
		unknownTopic: (topics: string) => `Unbekanntes Thema: ${topics}`,
		endpointMustBeHttps: 'Endpoint muss https sein',

		householdMissing: 'Der Haushalts-Datensatz fehlt. Bitte wende dich an den Support.',

		tasks: {
			name: 'Gib der Aufgabe einen Namen.',
			gone: 'Die Aufgabe ist schon erledigt.',
			snoozeDate: 'Wähle ein Datum zum Verschieben.',
			notANotification: 'Das ist keine Benachrichtigungs-Einstellung.'
		},

		shopping: {
			itemName: 'Gib dem Eintrag einen Namen.',
			storeName: 'Gib dem Geschäft einen Namen.'
		},

		recipes: {
			name: 'Gib dem Rezept einen Namen.',
			nameTooLong: (max: number) => `Der Name darf höchstens ${max} Zeichen haben.`,
			gone: 'Das Rezept gibt es nicht mehr.',
			gonePickAnother:
				'Das Rezept gibt es nicht mehr. Wähl ein anderes oder schreib, was ihr kocht.',
			mealDay: 'Wähle einen Tag für dieses Essen.',
			mealChoice: 'Wähl ein Rezept oder schreib, was ihr kocht.',
			mealGone: 'Dieses Essen steht nicht mehr im Plan.',
			timerLength: 'Das ist keine Zeitangabe.',
			timerLimit: (max: number) => `${max} Timer gleichzeitig sind das Maximum.`
		},

		photo: {
			notSaved: 'Das Foto konnte nicht gespeichert werden.',
			tooLarge: (megabytes: number) => `Das Foto ist zu groß — nimm eines unter ${megabytes} MB.`,
			notAnImage: 'Diese Datei ist kein Bild.',
			unreadable: 'Das Bild ließ sich nicht lesen — versuch es mit JPEG oder PNG.',
			storeFailed: 'Das Foto konnte nicht abgelegt werden.',
			diskFailed: 'Das Foto konnte nicht abgelegt werden — die Festplatte hat abgelehnt.'
		},

		household: {
			'color-taken': 'Die Farbe hat schon jemand im Haus.',
			'not-owner': 'Das kann nur die Besitzer:in.',
			'not-member': 'Du bist nicht mehr Mitglied dieses Haushalts.',
			'transfer-first': 'Mach zuerst jemand anderen zur Besitzer:in — ein Haushalt braucht eine.',
			'remove-self': 'Zum Selbst-Gehen nutze „Haushalt verlassen“ in den Einstellungen.',
			'stale-roster':
				'Du bist jetzt die einzige Person hier — gehen würde den Haushalt löschen. Lade neu und bestätige nochmal.'
		},

		displayName: 'Sag uns, wie wir dich nennen sollen.',
		pickColour: 'Wähl eine der Farben.',
		householdName: 'Gib deinem Zuhause einen Namen.',
		colourTakenJoin: 'Die Farbe hat schon jemand im Haushalt. Nimm eine andere.',
		ownerOnlyMembers: 'Nur die Besitzer:in kann Mitglieder verwalten.',
		alreadyLeft: 'Die Person hat den Haushalt schon verlassen.'
	},

	/* ── The holiday pause (→ SPEC §5.5), in [4c] and [6a] ─────────────────── */
	away: {
		title: 'Verreist?',
		detail: [
			{ text: 'Pausiere ' },
			{ text: 'alle deine Aufgaben', strong: true },
			{
				text: ', solange du im Urlaub bist — nichts gilt als überfällig und es kommen keine Erinnerungen.'
			}
		] as RichText,
		toggle: 'Verreist',
		backOn: 'Zurück am',
		pauseUntil: (date: string) => `Aufgaben pausieren bis ${date}`,
		updateUntil: (date: string) => `Pause ändern auf ${date}`
	}
};
