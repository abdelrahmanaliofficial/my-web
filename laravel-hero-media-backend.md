# إعداد الواجهة الخلفية لوسائط الرئيسية (Laravel Backend)

لإضافة قسم إدارة وسائط الرئيسية المتقدم في الـ Backend الخاص بـ Laravel ودعم رفع الملفات المتعددة، قم باتباع الخطوات التالية بالترتيب:

## 1. Migration (جدول قاعدة البيانات)

قم بإنشاء الـ Migration الخاص بجدول `hero_media` لتخزين نوع العرض النشط ومسارات/روابط كل نوع بشكل منفصل.

```bash
php artisan make:migration create_hero_media_table
```

ثم أضف الكود التالي بداخل الملف:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up()
    {
        Schema::create('hero_media', function (Blueprint $table) {
            $table->id();
            $table->enum('active_media_type', ['image', 'video', 'animation'])->default('image');
            $table->string('image_path')->nullable();
            $table->string('video_path')->nullable();
            $table->string('animation_path')->nullable();
            $table->timestamps();
        });
    }

    public function down()
    {
        Schema::dropIfExists('hero_media');
    }
};
```

## 2. Model (نموذج البيانات)

قم بإنشاء المودل `HeroMedia`:

```bash
php artisan make:model HeroMedia
```

```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class HeroMedia extends Model
{
    use HasFactory;

    protected $fillable = [
        'active_media_type',
        'image_path',
        'video_path',
        'animation_path',
    ];
}
```

## 3. Controller (متحكم الـ API)

قم بإنشاء المتحكم `HeroMediaController`:

```bash
php artisan make:controller API/HeroMediaController
```

```php
<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Models\HeroMedia;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class HeroMediaController extends Controller
{
    public function index()
    {
        $media = HeroMedia::latest()->first();
        return response()->json($media ?? [
            'active_media_type' => 'image', 
            'image_path' => '',
            'video_path' => '',
            'animation_path' => ''
        ]);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'active_media_type' => 'required|in:image,video,animation',
            'image_file' => 'nullable|image|mimes:jpeg,png,jpg,webp|max:5120', // 5MB
            'video_file' => 'nullable|mimetypes:video/mp4,video/webm|max:20480', // 20MB
            'animation_file' => 'nullable|file|mimes:json|max:5120',
            'image_url' => 'nullable|url',
            'video_url' => 'nullable|url',
            'animation_url' => 'nullable|url',
        ]);

        $media = HeroMedia::first() ?? new HeroMedia();
        $media->active_media_type = $validated['active_media_type'];

        // Image Handling
        if ($request->hasFile('image_file')) {
            $path = $request->file('image_file')->store('hero_media', 'public');
            $media->image_path = url('storage/' . $path);
        } elseif ($request->filled('image_url')) {
            $media->image_path = $validated['image_url'];
        }

        // Video Handling
        if ($request->hasFile('video_file')) {
            $path = $request->file('video_file')->store('hero_media', 'public');
            $media->video_path = url('storage/' . $path);
        } elseif ($request->filled('video_url')) {
            $media->video_path = $validated['video_url'];
        }

        // Animation Handling
        if ($request->hasFile('animation_file')) {
            $path = $request->file('animation_file')->store('hero_media', 'public');
            $media->animation_path = url('storage/' . $path);
        } elseif ($request->filled('animation_url')) {
            $media->animation_path = $validated['animation_url'];
        }

        $media->save();

        return response()->json($media, 200);
    }
}
```

*تأكد من تشغيل أمر `php artisan storage:link` لجعل الملفات المرفوعة متاحة للعرض.*

## 4. API Routes (المسارات)

في ملف `routes/api.php` قم بإضافة المسارات التالية:

```php
use App\Http\Controllers\API\HeroMediaController;

Route::get('/hero-media', [HeroMediaController::class, 'index']);

Route::middleware(['auth:sanctum', 'admin'])->group(function () {
    Route::post('/hero-media', [HeroMediaController::class, 'store']);
});
```

بهذه الخطوات تكون قد ربطت الواجهة الأمامية بشكل كامل مع قاعدة البيانات لإدارة الوسائط الخاصة بالـ Hero Section ديناميكياً وبكل احترافية.
