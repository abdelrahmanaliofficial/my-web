import React from 'react';
import { renderToString } from 'react-dom/server';
import PhoneInput from 'react-phone-number-input';
import flags from 'react-phone-number-input/flags';

const customFlags = {
  ...flags,
  IL: flags['PS'],
};

console.log(renderToString(<PhoneInput value="" onChange={() => {}} defaultCountry="IL" flags={customFlags} />));
