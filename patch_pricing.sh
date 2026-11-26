sed -i "s/{language === 'en' ? 'Pricing & Plans' : 'الباقات والأسعار'}/{language === 'ar' ? pricingContent?.title_ar : pricingContent?.title_en}/g" src/components/Pricing.tsx

sed -i "s/{language === 'en' \n              ? 'Flexible solutions to fit your needs. Choose the perfect plan for your project.' \n              : 'حلول مرنة لتناسب حجم أعمالك. اختر الباقة الأنسب عشان نكبر مشروعك سوا.'}/{language === 'ar' ? pricingContent?.subtitle_ar : pricingContent?.subtitle_en}/g" src/components/Pricing.tsx
