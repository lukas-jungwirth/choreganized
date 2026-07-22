import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * The kit gallery is a build tool, not a screen: it exists so a component can be
 * checked against design/Hearth.dc.html before the plan that first uses it
 * lands. Never reachable in production.
 */
export const load: PageServerLoad = () => {
	if (!dev) error(404, 'Not found');
	return {};
};
