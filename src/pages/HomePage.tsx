import React, { useState } from 'react';
import Hero from '../components/Hero';
import TrustedBy from '../components/TrustedBy';
import About from '../components/About';
import Services from '../components/Services';
import Portfolio from '../components/Portfolio';
import Pricing from '../components/Pricing';
import Testimonials from '../components/Testimonials';
import Contact from '../components/Contact';
import { useSettings } from '../contexts/SettingsContext';

const HomePage: React.FC = () => {
  const { settings } = useSettings();
  const [selectedPlan, setSelectedPlan] = useState<string>('Growth Marketing');

  return (
    <main className="bg-slate-950">
      <Hero />
      <TrustedBy />
      <About isHomePage />
      <Services isHomePage />
      {settings.pages.show_portfolio !== false && <Portfolio isHomePage />}
      {settings.pages.show_pricing !== false && <Pricing onSelectPlan={setSelectedPlan} />}
      {settings.pages.show_testimonials !== false && <Testimonials />}
      <Contact selectedPlan={selectedPlan} />
    </main>
  );
};

export default HomePage;
