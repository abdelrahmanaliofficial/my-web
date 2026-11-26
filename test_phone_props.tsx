import React from 'react';
import { renderToString } from 'react-dom/server';
import PhoneInput from 'react-phone-number-input';

const CustomFlag = (props: any) => {
  console.log('Props:', Object.keys(props));
  return <div />;
};

console.log(renderToString(<PhoneInput value="" onChange={() => {}} flagComponent={CustomFlag} />));
