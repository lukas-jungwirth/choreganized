/** `/legal/[page=legal]`: imprint or privacy, and nothing else is a route. */
import type { ParamMatcher } from '@sveltejs/kit';
import { isLegalPage, type LegalPage } from '$lib/utils/legal';

export const match = ((param: string): param is LegalPage =>
	isLegalPage(param)) satisfies ParamMatcher;
