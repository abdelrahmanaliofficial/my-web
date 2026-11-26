cat << 'INNER_EOF' > src/components/Services.tsx.patch
--- src/components/Services.tsx
+++ src/components/Services.tsx
@@ -5,17 +5,21 @@
 const Services = ({ isHomePage }: { isHomePage?: boolean }) => {
   const { language, dir } = useLanguage();
+  
+  const bgClass = isHomePage ? 'bg-transparent' : 'bg-slate-50';
+  const titleClass = isHomePage ? 'text-white' : 'text-slate-900';
+  const textClass = isHomePage ? 'text-slate-400' : 'text-slate-600';
+  const cardClass = isHomePage ? 'bg-[#0f172a] border-slate-800' : 'bg-white border-slate-200 shadow-sm';
 
   return (
-    <section className="py-16 max-w-5xl mx-auto px-4" id="services" dir={dir}>
+    <section className={`py-16 max-w-5xl mx-auto px-4 ${bgClass}`} id="services" dir={dir}>
       <div className={`mb-12 ${dir === 'rtl' ? 'text-right' : 'text-left'}`}> 
          <span className="text-sky-500 text-sm font-bold tracking-wider"> 
            {language === 'ar' ? 'ما أقدمه' : 'What I Offer'} 
          </span> 
-         <h2 className="text-4xl md:text-5xl font-bold text-white mt-2"> 
+         <h2 className={`text-4xl md:text-5xl font-bold mt-2 ${titleClass}`}> 
            {language === 'ar' ? 'خدماتي' : 'My Services'} 
          </h2> 
-         <p className="text-slate-400 mt-4 text-sm md:text-base"> 
+         <p className={`mt-4 text-sm md:text-base ${textClass}`}> 
            {language === 'ar' ? 'حلول برمجية مخصصة لنجاح أعمالك.' : 'Custom software solutions for your business success.'} 
          </p> 
       </div>
@@ -23,13 +27,13 @@
       <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
         
         {/* الكارت الأول: تطوير الويب */}
-        <div className={`bg-[#0f172a] border border-slate-800 rounded-2xl p-6 hover:border-sky-500 transition-colors flex flex-col ${dir === 'rtl' ? 'items-end text-right' : 'items-start text-left'}`}>
+        <div className={`rounded-2xl p-6 border hover:border-sky-500 transition-colors flex flex-col ${cardClass} ${dir === 'rtl' ? 'items-end text-right' : 'items-start text-left'}`}>
           <div className={`w-12 h-12 rounded-full bg-sky-950/50 flex items-center justify-center border border-sky-800/50 mb-6`}>
             <ChevronRight className={`text-sky-400 w-6 h-6 ${dir === 'ltr' ? 'rotate-180' : ''}`} />
           </div>
-          <h3 className="text-xl font-bold text-white mb-3">
+          <h3 className={`text-xl font-bold mb-3 ${titleClass}`}>
             {language === 'ar' ? 'تطوير الويب والتطبيقات' : 'Web & App Development'}
           </h3>
-          <p className="text-slate-400 text-sm leading-relaxed">
+          <p className={`text-sm leading-relaxed ${textClass}`}>
             {language === 'ar' 
               ? 'بناء تطبيقات ويب وهواتف ذكية سريعة وقابلة للتوسع.'
@@ -39,13 +43,13 @@
 
         {/* الكارت الثاني: استراتيجية العلامة التجارية */}
-        <div className={`bg-[#0f172a] border border-slate-800 rounded-2xl p-6 hover:border-sky-500 transition-colors flex flex-col ${dir === 'rtl' ? 'items-end text-right' : 'items-start text-left'}`}>
+        <div className={`rounded-2xl p-6 border hover:border-sky-500 transition-colors flex flex-col ${cardClass} ${dir === 'rtl' ? 'items-end text-right' : 'items-start text-left'}`}>
           <div className="w-12 h-12 rounded-full bg-sky-950/50 flex items-center justify-center border border-sky-800/50 mb-6">
             <Cpu className="text-sky-400 w-6 h-6" />
           </div>
-          <h3 className="text-xl font-bold text-white mb-3">
+          <h3 className={`text-xl font-bold mb-3 ${titleClass}`}>
             {language === 'ar' ? 'استراتيجية العلامة التجارية' : 'Brand Strategy'}
           </h3>
-          <p className="text-slate-400 text-sm leading-relaxed">
+          <p className={`text-sm leading-relaxed ${textClass}`}>
             {language === 'ar'
               ? 'صياغة هوية قوية ورسائل مميزة لعلامتك التجارية.'
@@ -55,13 +59,13 @@
 
         {/* الكارت الثالث: التسويق الرقمي */}
-        <div className={`bg-[#0f172a] border border-slate-800 rounded-2xl p-6 hover:border-sky-500 transition-colors flex flex-col ${dir === 'rtl' ? 'items-end text-right' : 'items-start text-left'}`}>
+        <div className={`rounded-2xl p-6 border hover:border-sky-500 transition-colors flex flex-col ${cardClass} ${dir === 'rtl' ? 'items-end text-right' : 'items-start text-left'}`}>
           <div className="w-12 h-12 rounded-full bg-sky-950/50 flex items-center justify-center border border-sky-800/50 mb-6">
             <Globe className="text-sky-400 w-6 h-6" />
           </div>
-          <h3 className="text-xl font-bold text-white mb-3">
+          <h3 className={`text-xl font-bold mb-3 ${titleClass}`}>
             {language === 'ar' ? 'التسويق الرقمي و SEO' : 'Digital Marketing & SEO'}
           </h3>
-          <p className="text-slate-400 text-sm leading-relaxed">
+          <p className={`text-sm leading-relaxed ${textClass}`}>
             {language === 'ar'
               ? 'أدير الحملات الإعلانية المدفوعة وأحسن ظهور موقعك في نتائج البحث لزيادة الوصول لجمهورك المستهدف.'
INNER_EOF
patch src/components/Services.tsx < src/components/Services.tsx.patch
