#!/bin/bash
sed -i '159,165c\
                {/* Catch-all Route */}\
                <Route path="*" element={<NotFound />} />\
              </Routes>\
              </React.Suspense>\
            </GlobalSearchProvider>\
            </FAQProvider>\
            </ProjectsProvider>\
' src/App.tsx
