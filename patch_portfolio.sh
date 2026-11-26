cat << 'INNER_EOF' > src/components/Portfolio.tsx.patch
--- src/components/Portfolio.tsx
+++ src/components/Portfolio.tsx
@@ -29,7 +29,7 @@
             <span className="text-sky-500 font-mono text-sm tracking-widest uppercase mb-4 block">
               {language === 'ar' ? 'أعمالي' : 'My Work'}
             </span>
-            <h2 className="text-4xl md:text-5xl font-black text-white font-display tracking-tight mb-6 leading-tight">
+            <h2 className={`text-4xl md:text-5xl font-black font-display tracking-tight mb-6 leading-tight ${isHomePage ? 'text-white' : 'text-slate-900'}`}>
               {language === 'ar' ? 'مشاريع مختارة' : 'Selected Projects'}
             </h2>
             <p className="text-slate-400 text-lg max-w-xl leading-relaxed">
@@ -37,7 +37,7 @@
             </p>
           </div>
 
-          <div className="flex flex-wrap gap-2 p-2 bg-slate-900/50 backdrop-blur-md rounded-2xl border border-white/5">
+          <div className={`flex flex-wrap gap-2 p-2 backdrop-blur-md rounded-2xl border ${isHomePage ? 'bg-slate-900/50 border-white/5' : 'bg-white border-slate-200'}`}>
             {categories.map((cat) => (
               <button
                 key={cat}
@@ -45,7 +45,7 @@
                 className={`px-6 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 ${
                   activeCategory === cat
                     ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/25'
-                    : 'text-slate-400 hover:text-white hover:bg-white/5'
+                    : isHomePage ? 'text-slate-400 hover:text-white hover:bg-white/5' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                 }`}
               >
                 {cat.charAt(0).toUpperCase() + cat.slice(1)}
@@ -80,7 +80,7 @@
                   exit={{ opacity: 0, scale: 0.9 }}
                   transition={{ duration: 0.5 }}
                   key={project.id || index}
-                  className="group relative rounded-[2rem] overflow-hidden glass-card cursor-pointer"
+                  className={`group relative rounded-[2rem] overflow-hidden cursor-pointer ${isHomePage ? 'glass-card' : 'bg-white border border-slate-200 shadow-sm hover:border-sky-500'}`}
                   onClick={() => setSelectedProject(project)}
                 >
                   <div className="aspect-[4/3] w-full relative overflow-hidden bg-slate-900/50">
@@ -107,10 +107,10 @@
                   </div>
 
                   <div className="p-8">
-                    <div className="flex items-center gap-3 mb-4">
+                    <div className="flex items-center gap-3 mb-4 flex-wrap">
                       {project.tags.slice(0,2).map((tag: string, i: number) => (
                         <span key={i} className="px-3 py-1 text-xs font-mono text-sky-400 bg-sky-500/10 rounded-full border border-sky-500/20">
                           {tag}
                         </span>
                       ))}
                     </div>
-                    <h3 className="text-2xl font-bold text-white mb-3 group-hover:text-sky-400 transition-colors">
+                    <h3 className={`text-2xl font-bold mb-3 group-hover:text-sky-400 transition-colors ${isHomePage ? 'text-white' : 'text-slate-900'}`}>
                       {language === 'ar' ? project.title_ar : project.title_en}
                     </h3>
-                    <p className="text-slate-400 text-sm line-clamp-2">
+                    <p className={`text-sm line-clamp-2 ${isHomePage ? 'text-slate-400' : 'text-slate-600'}`}>
                       {language === 'ar' ? project.description_ar : project.description_en}
                     </p>
                   </div>
@@ -140,11 +140,11 @@
               exit={{ opacity: 0, scale: 0.95 }}
               transition={{ duration: 0.3 }}
               onClick={(e) => e.stopPropagation()}
-              className="relative w-full max-w-4xl bg-[#0f172a] border border-slate-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col md:flex-row"
+              className={`relative w-full max-w-4xl border rounded-3xl overflow-hidden shadow-2xl flex flex-col md:flex-row ${isHomePage ? 'bg-[#0f172a] border-slate-800' : 'bg-white border-slate-200'}`}
             >
               <button 
                 onClick={() => setSelectedProject(null)}
-                className="absolute top-4 right-4 z-50 p-2 bg-black/50 hover:bg-black/80 text-white rounded-full transition-colors"
+                className={`absolute top-4 right-4 z-50 p-2 rounded-full transition-colors ${isHomePage ? 'bg-black/50 hover:bg-black/80 text-white' : 'bg-slate-200 hover:bg-slate-300 text-slate-800'}`}
               >
                 <X size={20} />
               </button>
@@ -165,11 +165,11 @@
               </div>
 
-              <div className="w-full md:w-1/2 p-8 md:p-10 flex flex-col justify-center">
-                <h3 className="text-3xl font-bold text-white mb-4">
+              <div className="w-full md:w-1/2 p-8 md:p-10 flex flex-col justify-center max-h-[80vh] overflow-y-auto">
+                <h3 className={`text-3xl font-bold mb-4 ${isHomePage ? 'text-white' : 'text-slate-900'}`}>
                   {language === 'ar' ? selectedProject.title_ar : selectedProject.title_en}
                 </h3>
-                <p className="text-slate-400 mb-8 leading-relaxed">
+                <p className={`mb-8 leading-relaxed ${isHomePage ? 'text-slate-400' : 'text-slate-600'}`}>
                   {language === 'ar' ? selectedProject.description_ar : selectedProject.description_en}
                 </p>
                 
-                <div className="flex flex-wrap gap-2 mb-8">
+                <div className="flex flex-wrap gap-2 mb-8 mt-auto">
                   {selectedProject.tags.map((tag: string, i: number) => (
                     <span key={i} className="px-3 py-1 text-xs font-mono text-sky-400 bg-sky-500/10 rounded-full border border-sky-500/20">
INNER_EOF
patch src/components/Portfolio.tsx < src/components/Portfolio.tsx.patch
