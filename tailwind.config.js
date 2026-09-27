/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{ts,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                'th-bg': 'var(--color-bg)',
                'th-bg2': 'var(--color-bg-secondary)',
                'th-fg': 'var(--color-fg)',
                'th-accent1': 'var(--color-accent1)',
                'th-accent2': 'var(--color-accent2)',
                'th-accent3': 'var(--color-accent3)',
                'th-card': 'var(--color-card)',
                'th-border': 'var(--color-border)',
                'th-muted': 'var(--color-muted)',
                'th-wolf': 'var(--color-wolf)',
                'th-god': 'var(--color-god)',
                'th-villager': 'var(--color-villager)',
                'th-dead': 'var(--color-dead)',
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
