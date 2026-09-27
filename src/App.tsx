
import React, { Suspense, lazy, useEffect } from 'react';
import { useAtomValue } from 'jotai';
import { appScreenAtom } from './store';
import { ThemeProvider } from './themes/ThemeProvider';
import StateHydrator from './components/StateHydrator';
import { initPixelCursor } from './utils/pixelCursor';
import DebugLogOverlay from './components/DebugLogOverlay';
import ToastContainer from './components/Toast';

const HomeView = lazy(() => import('./components/HomeView'));
const GameRoomView = lazy(() => import('./components/GameRoomView'));
const SettingsView = lazy(() => import('./components/settings/SettingsView'));
const AgentView = lazy(() => import('./components/AgentView'));
const HistoryView = lazy(() => import('./components/HistoryView'));
const RulesView = lazy(() => import('./components/RulesView'));
const MultiplayerView = lazy(() =>
    import('./multiplayer/MultiplayerView').then((module) => ({ default: module.MultiplayerView }))
);


const App = () => {
    const screen = useAtomValue(appScreenAtom);

    useEffect(() => { initPixelCursor(); }, []);

    // ID for the container we want to capture
    const APP_CONTENT_ID = "app-content-area";

    const renderContent = () => {
        switch (screen) {
            case 'HOME':
                return <HomeView />;
            case 'GAME':
                return <GameRoomView />;
            case 'SETTINGS':
                return <SettingsView />;
            case 'AGENT':
                return <AgentView />;
            case 'HISTORY':
                return <HistoryView />;
            case 'RULES':
                return <RulesView />;
            case 'MULTIPLAYER':
                return <MultiplayerView />;
            default:
                return <HomeView />;
        }
    };

    return (
        <ThemeProvider>
        <React.Fragment>
<div className="w-full h-full transition-all duration-500 ease-in-out scrollbar-hide">
                <div
                    id={APP_CONTENT_ID}
className="relative highlight-white/5 transition-all duration-500 w-full h-full min-h-screen sm:min-h-full"
                    style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-fg)' }}
                >
                    <Suspense fallback={null}>
                        {renderContent()}
                    </Suspense>
                </div>
            </div>

            <Suspense fallback={null}>
                <StateHydrator />
            </Suspense>

            <DebugLogOverlay />
            <ToastContainer />
        </React.Fragment>
        </ThemeProvider>
    );
};

export default App;
