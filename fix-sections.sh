#!/bin/bash
for file in src/components/Experience.tsx src/components/Portfolio.tsx src/components/Pricing.tsx src/components/Testimonials.tsx src/components/Blog.tsx src/components/Contact.tsx src/components/Services.tsx
do
  if [ -f "$file" ]; then
    # Get the base name for deciding background
    basename=$(basename "$file")
    bg="bg-white"
    if [ "$basename" == "Services.tsx" ] || [ "$basename" == "Portfolio.tsx" ] || [ "$basename" == "Testimonials.tsx" ] || [ "$basename" == "Contact.tsx" ]; then
      bg="bg-sky-50"
    fi
    
    # We replace <section className="py-24 scroll-mt-20" id="...">
    # with <section className="py-24 scroll-mt-20 w-full $bg" id="...">\n      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-12">
    # And we need to add a closing </div> before </section>
    
    # Let's do it carefully with sed or just manually since there's only 7 files.
  fi
done
