import React from 'react';
import { renderToString } from 'react-dom/server';
import PhoneInput from 'react-phone-number-input';
import enLabels from 'react-phone-number-input/locale/en';

const labels = {
  ...enLabels,
  IL: 'Palestine',
};

console.log(renderToString(<PhoneInput value="" onChange={() => {}} labels={labels} />));
