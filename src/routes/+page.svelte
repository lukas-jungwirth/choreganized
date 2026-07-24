<!-- Never rendered: the server load above always redirects. Kept as the
	 no-JS/edge fallback so `/` is a real route. -->
<script lang="ts">
	import { messages } from '$lib/i18n';

	const m = messages();
</script>

<p>{m.auth.redirecting}</p>
