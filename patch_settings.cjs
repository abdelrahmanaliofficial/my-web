const fs = require('fs');
let content = fs.readFileSync('src/pages/dashboard/Settings.tsx', 'utf-8');

// Add to default state
content = content.replace(
  "logo_url: settings.appearance?.logo_url || '',",
  "logo_url: settings.appearance?.logo_url || '',\n      logo_dark_url: settings.appearance?.logo_dark_url || '',"
);

// Add dark logo upload handlers
const handleDarkLogoUpload = `  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        updateData('appearance', { ...data.appearance, logo_url: reader.result as string });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDarkLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        updateData('appearance', { ...data.appearance, logo_url: data.appearance.logo_url, logo_dark_url: reader.result as string });
      };
      reader.readAsDataURL(file);
    }
  };`;

content = content.replace(
  /const handleLogoUpload = \(e: React\.ChangeEvent<HTMLInputElement>\) => {[\s\S]*?};/,
  handleDarkLogoUpload
);

// Add logo_dark_url input field state
content = content.replace(
  "const [logoUrlInput, setLogoUrlInput] = useState('');",
  "const [logoUrlInput, setLogoUrlInput] = useState('');\n  const [darkLogoUrlInput, setDarkLogoUrlInput] = useState('');\n  const [showDarkLogoUrlInput, setShowDarkLogoUrlInput] = useState(false);"
);

// Replace entire Logo Settings block
const logoBlockRegex = /\{\/\* Logo Settings \*\/\}.*?(?=\{\/\* Colors \*\/\})/s;
const logoBlockMatch = content.match(logoBlockRegex);

if (logoBlockMatch) {
  const newLogoBlock = `{/* Logo Settings */}
                <div className="bg-white/50 dark:bg-slate-900/50 border border-sky-500/30 dark:border-sky-900/50 rounded-2xl p-6">
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4 uppercase tracking-widest">{dir === 'rtl' ? 'شعار الموقع (Logo)' : 'Site Logo'}</h3>
                  
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Default Logo */}
                    <div className="space-y-4">
                      <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">{dir === 'rtl' ? 'الشعار الافتراضي' : 'Default Logo'}</h4>
                      <div className="flex flex-col sm:flex-row gap-6 items-start">
                        <div className="flex-shrink-0">
                          {data.appearance.logo_url ? (
                            <div className="relative group">
                              <img src={data.appearance.logo_url} alt="Logo Preview" className="h-20 w-auto object-contain bg-slate-50 dark:bg-slate-900/60 dark:bg-slate-800 p-2 rounded-xl border border-sky-500/30 dark:border-slate-700" />
                              <button
                                type="button"
                                onClick={() => updateData('appearance', { ...data.appearance, logo_url: '' })}
                                className="absolute -top-2 -right-2 bg-red-500 text-slate-900 dark:text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ) : (
                            <div className="h-20 w-20 flex items-center justify-center bg-slate-50 dark:bg-slate-900/60 dark:bg-slate-800 rounded-xl border border-dashed border-slate-300 dark:border-slate-600">
                              <ImageIcon className="w-8 h-8 text-slate-500 dark:text-slate-400" />
                            </div>
                          )}
                        </div>
                        
                        <div className="flex-1 space-y-4">
                          <div>
                            <div className="flex flex-col xl:flex-row gap-3 items-start xl:items-center">
                              <label className="flex w-full xl:w-auto items-center justify-center px-4 py-2 bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400 rounded-lg cursor-pointer hover:bg-sky-100 dark:hover:bg-sky-500/20 transition-colors font-medium text-sm border border-sky-200 dark:border-sky-500/30">
                                <Upload className="w-4 h-4 mr-2 rtl:mr-0 rtl:ml-2" />
                                {dir === 'rtl' ? 'رفع صورة' : 'Upload Image'}
                                <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                              </label>
                              
                              <button
                                type="button"
                                onClick={() => setShowLogoUrlInput(!showLogoUrlInput)}
                                className="flex w-full xl:w-auto items-center justify-center px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors font-medium text-sm border border-slate-200 dark:border-slate-700"
                              >
                                <LinkIcon className="w-4 h-4 mr-2 rtl:mr-0 rtl:ml-2" />
                                {dir === 'rtl' ? 'رابط مباشر' : 'Image URL'}
                              </button>
                            </div>
                            
                            {showLogoUrlInput && (
                              <div className="mt-3 flex gap-2">
                                <input
                                  type="url"
                                  value={logoUrlInput}
                                  onChange={(e) => setLogoUrlInput(e.target.value)}
                                  placeholder="https://example.com/logo.png"
                                  className="flex-1 w-full min-w-0 bg-slate-50 dark:bg-slate-900/60 dark:bg-slate-900 border border-sky-500/30 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-sky-500"
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (logoUrlInput) {
                                      try {
                                        new URL(logoUrlInput);
                                        const updatedData = {
                                          ...data,
                                          appearance: { ...data.appearance, logo_url: logoUrlInput }
                                        };
                                        updateData('appearance', updatedData.appearance);
                                        saveSettingsContext(updatedData);
                                        setLogoUrlInput('');
                                        setShowLogoUrlInput(false);
                                        toast.success(dir === 'rtl' ? 'تم تطبيق الشعار بنجاح' : 'Logo applied successfully');
                                      } catch (e) {
                                        toast.error(dir === 'rtl' ? 'يرجى إدخال رابط صورة صالح' : 'Please enter a valid image URL');
                                      }
                                    }
                                  }}
                                  className="px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white font-bold text-sm rounded-lg transition-colors whitespace-nowrap"
                                >
                                  {dir === 'rtl' ? 'تطبيق' : 'Apply'}
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Dark Mode Logo */}
                    <div className="space-y-4">
                      <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">{dir === 'rtl' ? 'الشعار الداكن / للنافبار' : 'Dark Mode / Navbar Logo'}</h4>
                      <div className="flex flex-col sm:flex-row gap-6 items-start">
                        <div className="flex-shrink-0">
                          {data.appearance.logo_dark_url ? (
                            <div className="relative group">
                              <img src={data.appearance.logo_dark_url} alt="Dark Logo Preview" className="h-20 w-auto object-contain bg-slate-900 p-2 rounded-xl border border-sky-500/30 dark:border-slate-700" />
                              <button
                                type="button"
                                onClick={() => updateData('appearance', { ...data.appearance, logo_dark_url: '' })}
                                className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ) : (
                            <div className="h-20 w-20 flex items-center justify-center bg-slate-900 rounded-xl border border-dashed border-slate-600">
                              <ImageIcon className="w-8 h-8 text-slate-600" />
                            </div>
                          )}
                        </div>
                        
                        <div className="flex-1 space-y-4">
                          <div>
                            <div className="flex flex-col xl:flex-row gap-3 items-start xl:items-center">
                              <label className="flex w-full xl:w-auto items-center justify-center px-4 py-2 bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400 rounded-lg cursor-pointer hover:bg-sky-100 dark:hover:bg-sky-500/20 transition-colors font-medium text-sm border border-sky-200 dark:border-sky-500/30">
                                <Upload className="w-4 h-4 mr-2 rtl:mr-0 rtl:ml-2" />
                                {dir === 'rtl' ? 'رفع صورة' : 'Upload Image'}
                                <input type="file" accept="image/*" className="hidden" onChange={handleDarkLogoUpload} />
                              </label>
                              
                              <button
                                type="button"
                                onClick={() => setShowDarkLogoUrlInput(!showDarkLogoUrlInput)}
                                className="flex w-full xl:w-auto items-center justify-center px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors font-medium text-sm border border-slate-200 dark:border-slate-700"
                              >
                                <LinkIcon className="w-4 h-4 mr-2 rtl:mr-0 rtl:ml-2" />
                                {dir === 'rtl' ? 'رابط مباشر' : 'Image URL'}
                              </button>
                            </div>
                            
                            {showDarkLogoUrlInput && (
                              <div className="mt-3 flex gap-2">
                                <input
                                  type="url"
                                  value={darkLogoUrlInput}
                                  onChange={(e) => setDarkLogoUrlInput(e.target.value)}
                                  placeholder="https://example.com/logo-dark.png"
                                  className="flex-1 w-full min-w-0 bg-slate-50 dark:bg-slate-900/60 dark:bg-slate-900 border border-sky-500/30 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-sky-500"
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (darkLogoUrlInput) {
                                      try {
                                        new URL(darkLogoUrlInput);
                                        const updatedData = {
                                          ...data,
                                          appearance: { ...data.appearance, logo_dark_url: darkLogoUrlInput }
                                        };
                                        updateData('appearance', updatedData.appearance);
                                        saveSettingsContext(updatedData);
                                        setDarkLogoUrlInput('');
                                        setShowDarkLogoUrlInput(false);
                                        toast.success(dir === 'rtl' ? 'تم تطبيق الشعار بنجاح' : 'Logo applied successfully');
                                      } catch (e) {
                                        toast.error(dir === 'rtl' ? 'يرجى إدخال رابط صورة صالح' : 'Please enter a valid image URL');
                                      }
                                    }
                                  }}
                                  className="px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white font-bold text-sm rounded-lg transition-colors whitespace-nowrap"
                                >
                                  {dir === 'rtl' ? 'تطبيق' : 'Apply'}
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="mt-6 pt-6 border-t border-sky-500/20 dark:border-sky-900/50">
                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">{dir === 'rtl' ? 'طريقة العرض' : 'Display Mode'}</label>
                    <select
                      value={data.appearance.logo_display}
                      onChange={(e) => updateData('appearance', { ...data.appearance, logo_display: e.target.value as any })}
                      className="w-full bg-slate-50 dark:bg-slate-900/60 dark:bg-slate-900 border border-sky-500/30 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-sky-500"
                    >
                      <option value="logo_only">{dir === 'rtl' ? 'شعار فقط' : 'Logo Only'}</option>
                      <option value="logo_and_text">{dir === 'rtl' ? 'شعار مع نص' : 'Logo and Text'}</option>
                      <option value="text_only">{dir === 'rtl' ? 'نص فقط' : 'Text Only'}</option>
                      <option value="hidden">{dir === 'rtl' ? 'إخفاء' : 'Hidden'}</option>
                    </select>
                  </div>
                </div>
                
                `;
  content = content.replace(logoBlockRegex, newLogoBlock);
}

fs.writeFileSync('src/pages/dashboard/Settings.tsx', content);
