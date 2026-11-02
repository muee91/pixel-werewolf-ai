/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{ts,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                'th-bg': 'rgb(var(--th-bg-rgb) / <alpha-value>)',
                'th-bg2': 'var(--color-bg-secondary)',
                'th-fg': 'rgb(var(--th-fg-rgb) / <alpha-value>)',
                'th-accent1': 'rgb(var(--th-accent1-rgb) / <alpha-value>)',
                'th-accent2': 'rgb(var(--th-accent2-rgb) / <alpha-value>)',
                'th-accent3': 'rgb(var(--th-accent3-rgb) / <alpha-value>)',
                'th-card': 'rgb(var(--th-card-rgb) / <alpha-value>)',
                'th-border': 'rgb(var(--th-border-rgb) / <alpha-value>)',
                'th-muted': 'var(--color-muted)',
                'th-wolf': 'rgb(var(--th-wolf-rgb) / <alpha-value>)',
                'th-god': 'rgb(var(--th-god-rgb) / <alpha-value>)',
                'th-villager': 'var(--color-villager)',
                'th-dead': 'rgb(var(--th-dead-rgb) / <alpha-value>)',
            },
            borderRadius: {
                'th': 'var(--radius)',
            },
            fontFamily: {
                'th-display': 'var(--font-active-display)',
                'th-body': 'var(--font-active-body)',
                'th-mono': 'var(--font-active-mono)',
            },
            animation: {
                'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                'fade-in-up': 'fadeInUp 0.5s ease-out forwards',
                'fly-in-top': 'flyInTop 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) backwards',
                'fly-in-bottom': 'flyInBottom 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) backwards',
            },
            keyframes: {
                fadeInUp: {
                    '0%': { opacity: '0', transform: 'translateY(10px)' },
                    '100%': { opacity: '1', transform: 'translateY(0)' },
                },
                flyInTop: {
                    '0%': { opacity: '0', transform: 'translateY(40vh) scale(0.5)' },
                    '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
                },
                flyInBottom: {
                    '0%': { opacity: '0', transform: 'translateY(-40vh) scale(0.5)' },
                    '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
                },
            },
        },
    },
    plugins: [],
}
