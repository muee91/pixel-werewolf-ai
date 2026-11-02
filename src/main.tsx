import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

const container = document.getElementById('app');
if (container) {
    const root = createRoot(container);
    root.render(
        <React.Suspense fallback={
            <div className="h-screen w-screen flex items-center justify-center font-bold"
                style={{ background: 'var(--voxel-night)', color: 'var(--voxel-paper)' }}>
                加载数据中...
            </div>
        }>
            <ErrorBoundary><App /></ErrorBoundary>
        </React.Suspense>
    );
}