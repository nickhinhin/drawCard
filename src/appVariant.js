// LiveDraw now has one public experience. Keep this as a code constant so a
// missing or incorrect Vite mode can never silently build the retired UI.
export const IS_BETA = true;

// The admin workspace ships as a separate build on its own Hosting site.
// Vite inlines this flag, so the public bundle drops every admin component.
export const IS_ADMIN_SITE = import.meta.env.VITE_ADMIN_SITE === "true";
