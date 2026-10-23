import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout.jsx';
import FamilyHome from './components/home/FamilyHome.jsx';
import AgentCenter from './components/agents/AgentCenter.jsx';
import AISettings from './components/settings/AISettings.jsx';
import Login from './components/auth/Login.jsx';
import { VideoPlayerProvider } from './components/common/VideoPlayer.jsx';

function App() {
  return (
    <BrowserRouter>
      <VideoPlayerProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<AppLayout />}>
            <Route path="/" element={<FamilyHome />} />
            <Route path="/agents" element={<AgentCenter />} />
            <Route path="/settings" element={<AISettings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </VideoPlayerProvider>
    </BrowserRouter>
  );
}

export default App;
