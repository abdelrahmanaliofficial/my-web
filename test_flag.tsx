import React from 'react';
import { renderToString } from 'react-dom/server';
import PhoneInput from 'react-phone-number-input';

const CustomFlag = ({ country, countryName, flagUrl }: any) => {
  if (!country) return null;
  const code = country === 'IL' ? 'PS' : country;
  const url = flagUrl 
    ? flagUrl.replace('{XX}', code).replace('{xx}', code.toLowerCase())
    : `https://purecatamphetamine.github.io/country-flag-icons/3x2/${code}.svg`;
  
  return <img src={url} alt={countryName} className="PhoneInputCountryIconImg" />;
};

console.log(renderToString(<PhoneInput value="" onChange={() => {}} defaultCountry="IL" flagComponent={CustomFlag} />));
