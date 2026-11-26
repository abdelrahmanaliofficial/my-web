cat << 'INNER_EOF' > src/components/About.tsx.patch
--- src/components/About.tsx
+++ src/components/About.tsx
@@ -9,7 +9,7 @@
         <span className="text-sky-500 text-sm font-bold tracking-wider">
           {language === 'ar' ? 'من أنا' : 'About Me'}
         </span>
-        <h2 className="text-3xl md:text-4xl font-bold text-white mt-2">
+        <h2 className={`text-3xl md:text-4xl font-bold mt-2 ${isHomePage ? 'text-white' : 'text-slate-900'}`}>
           {language === 'ar' ? 'من أنا' : 'About Me'}
         </h2>
       </div>
 
       {/* الكارت الرئيسي بحجم أصغر وتناسق أعلى */}
-      <div className={`bg-[#0f172a] border border-slate-800 rounded-2xl p-6 md:p-8 shadow-lg ${dir === 'rtl' ? 'text-right' : 'text-left'}`}>
-        <p className="text-slate-300 text-sm md:text-base leading-relaxed mb-8">
+      <div className={`${isHomePage ? 'bg-slate-900/60 border-slate-800' : 'bg-white border-slate-200'} border rounded-2xl p-6 md:p-8 shadow-lg ${dir === 'rtl' ? 'text-right' : 'text-left'}`}>
+        <p className={`${isHomePage ? 'text-slate-300' : 'text-slate-700'} text-sm md:text-base leading-relaxed mb-8`}>
           {language === 'ar' 
             ? 'أنا أخصائي تسويق رقمي ومستشار أعمال مكرس لتحفيز النمو من خلال استراتيجيات مدعومة بالبيانات. بخبرة عميقة في مسارات التسويق، تحسين محركات البحث (SEO)، والاستشارات الاستراتيجية، أقوم بتمكين الشركات من التوسع المستدام وتحقيق نجاح ملموس.'
             : 'I am a digital marketing specialist and business consultant dedicated to driving growth through data-backed strategies. With deep expertise in marketing funnels, SEO, and strategic consulting, I empower businesses to scale sustainably and achieve measurable success.'}
         </p>
 
-        <div className={`mt-8 border-t border-slate-800 pt-8 ${dir === 'rtl' ? 'text-right' : 'text-left'}`}>
-          <h3 className="text-xl md:text-2xl font-bold text-white mb-2">
+        <div className={`mt-8 border-t ${isHomePage ? 'border-slate-800' : 'border-slate-200'} pt-8 ${dir === 'rtl' ? 'text-right' : 'text-left'}`}>
+          <h3 className={`text-xl md:text-2xl font-bold mb-2 ${isHomePage ? 'text-white' : 'text-slate-900'}`}>
             {language === 'ar' ? 'المهارات التقنية والتسويقية' : 'Technical & Marketing Skills'}
           </h3>
-          <p className="text-slate-400 text-xs md:text-sm mb-8">
+          <p className={`${isHomePage ? 'text-slate-400' : 'text-slate-500'} text-xs md:text-sm mb-8`}>
             {language === 'ar' ? 'أدوات وتقنيات أعتمد عليها لتقديم حلول متكاملة' : 'Tools and technologies I rely on to deliver integrated solutions'}
           </p>
INNER_EOF
patch src/components/About.tsx < src/components/About.tsx.patch
