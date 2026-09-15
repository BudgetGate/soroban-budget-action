import { Cloud, GitBranch } from 'lucide-react';
import { Routes, Route, Link } from 'react-router-dom';
import Home from './Home';
import Docs from './Docs';
import './index.css';

function App() {
  return (
    <>
      <div className="ethereal-orb orb-1"></div>
      <div className="ethereal-orb orb-2"></div>
      
      <div className="ethereal-container">
        <nav className="ethereal-nav">
          <div className="ethereal-logo">
            <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'inherit', textDecoration: 'none' }}>
              <Cloud strokeWidth={1} size={24} />
              <span>budget-action</span>
            </Link>
          </div>
          <a href="https://github.com/soroban-budget-action" className="ethereal-nav-link">
            <GitBranch strokeWidth={1.5} size={16} />
            GitHub
          </a>
          <Link to="/docs" className="ethereal-nav-link">
            <Cloud strokeWidth={1.5} size={16} />
            Docs
          </Link>
        </nav>

        <main className="ethereal-main">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/docs" element={<Docs />} />
          </Routes>
        </main>

        <footer className="ethereal-footer">
          <p>&copy; {new Date().getFullYear()} soroban-budget-action &middot; Ethereal Edition</p>
        </footer>
      </div>
    </>
  );
}

export default App;
