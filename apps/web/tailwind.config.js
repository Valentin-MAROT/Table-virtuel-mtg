/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Relevés sur la table de référence : gray-900 / gray-800 / gray-700.
        table: '#111827',
        panel: '#1f2937',
        edge: '#374151',
        dice: '#9333ea',
        /*
         * Le cran que l'échelle Tailwind n'a pas : elle saute de `slate-700`
         * (#334155) à `slate-800` (#1e293b). La barre d'actions demandait
         * `border-slate-750`, qui ne produisait donc aucune règle — et la
         * bordure retombait sur le défaut clair de `preflight`, du gris pâle sur
         * un panneau sombre. Ce jeton est le milieu exact des deux, et il étend
         * l'échelle `slate` plutôt que d'ajouter une couleur au nom composé :
         * c'est la même classe au bout, mais elle reste à sa place dans la
         * palette.
         */
        slate: { 750: '#293548' },
        life: { minus: '#dc2626', plus: '#16a34a' },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'Segoe UI', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
