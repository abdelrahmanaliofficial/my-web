import React from 'react';
import Portfolio from '../components/Portfolio';
import Contact from '../components/Contact';

const PortfolioPage: React.FC = () => {
  return (
    <main className="pt-24 bg-slate-950 min-h-screen">
      <Portfolio isHomePage />
      <Contact />
    </main>
  );
};

export default PortfolioPage;
