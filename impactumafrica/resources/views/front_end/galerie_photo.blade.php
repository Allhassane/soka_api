<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title> ONG IMPACTUM | Galerie photo </title>
    <!-- favicons Icons -->
    <link rel="apple-touch-icon" sizes="180x180" href="{{asset('assets/img/favicons/apple-touch-icon.png')}}" />
    <link rel="icon" type="image/png" sizes="32x32" href="{{asset('assets/img/logo/logo.png')}}" />
    <link rel="manifest" href="{{asset('assets/img/favicons/site.webmanifest')}}" />

    <meta name="author" content="impactumtemplate">
    <meta name="description" content="Les differentes images de l'ONG IMPACTUM">

    <!-- fonts -->
    <link rel="preconnect" href="https://fonts.googleapis.com">

    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>

    <link
        href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,400;0,500;0,700;1,400;1,500;1,700&display=swap"
        rel="stylesheet">
    <link href="https://fonts.googleapis.com/css2?family=Amatic+SC:wght@400;700&display=swap" rel="stylesheet">

    <link rel="stylesheet" href="{{asset('assets/vendors/bootstrap/css/bootstrap.min.css')}}" />
    <link rel="stylesheet" href="{{asset('assets/vendors/animate/animate.min.css')}}" />
    <link rel="stylesheet" href="{{asset('assets/vendors/animate/custom-animate.css')}}" />
    <link rel="stylesheet" href="{{asset('assets/vendors/fontawesome/css/all.min.css')}}" />
    <link rel="stylesheet" href="{{asset('assets/vendors/jarallax/jarallax.css')}}" />
    <link rel="stylesheet" href="{{asset('assets/vendors/jquery-magnific-popup/jquery.magnific-popup.css')}}" />
    <link rel="stylesheet" href="{{asset('assets/vendors/nouislider/nouislider.min.css')}}" />
    <link rel="stylesheet" href="{{asset('assets/vendors/nouislider/nouislider.pips.css')}}" />
    <link rel="stylesheet" href="{{asset('assets/vendors/odometer/odometer.min.css')}}" />
    <link rel="stylesheet" href="{{asset('assets/vendors/swiper/swiper.min.css')}}" />
    <link rel="stylesheet" href="{{asset('assets/vendors/agrion-icons/style.css')}}">
    <link rel="stylesheet" href="{{asset('assets/vendors/tiny-slider/tiny-slider.min.css')}}" />
    <link rel="stylesheet" href="{{asset('assets/vendors/reey-font/stylesheet.css')}}" />
    <link rel="stylesheet" href="{{asset('assets/vendors/owl-carousel/owl.carousel.min.css')}}" />
    <link rel="stylesheet" href="{{asset('assets/vendors/owl-carousel/owl.theme.default.min.css')}}" />
    <link rel="stylesheet" href="{{asset('assets/vendors/bxslider/jquery.bxslider.css')}}" />
    <link rel="stylesheet" href="{{asset('assets/vendors/bootstrap-select/css/bootstrap-select.min.css')}}" />
    <link rel="stylesheet" href="{{asset('assets/vendors/vegas/vegas.min.css')}}" />
    <link rel="stylesheet" href="{{asset('assets/vendors/jquery-ui/jquery-ui.css')}}" />
    <link rel="stylesheet" href="{{asset('assets/vendors/timepicker/timePicker.css')}}" />

    <!-- template styles -->
    <link rel="stylesheet" href="{{asset('assets/css/agrion.css')}}" />
    <link rel="stylesheet" href="{{asset('assets/css/agrion-responsive.css')}}" />
    <link rel="stylesheet" href="{{asset('assets/css/my_style.css')}}" />
</head>

<body class="custom-cursor">

<div class="custom-cursor__cursor"></div>
<div class="custom-cursor__cursor-two"></div>

<div class="page-wrapper">
    @include('components.frontend.header')

    <div class="stricky-header stricked-menu main-menu main-menu-two">
        <div class="sticky-header__content"></div><!-- /.sticky-header__content -->
    </div><!-- /.stricky-header -->

    <section class="page-header">
        <div class="page-header-bg" style="background-image: url({{asset('assets/img/projet.jpg')}})">
        </div>
        <div class="container">
            <div class="page-header__inner">
                <h2> {{ __('menu.menu_mediatheque') }} - {{ __('menu.menu_photo') }}</h2>
            </div>
        </div>
    </section>

    <section class="services-page">
        <div class="container">
            <div class="row">
                @if($photos->count()>0)
                    @foreach($photos as $photo)
                        <div class="col-xl-4 col-lg-4 wow fadeInUp" data-wow-delay="100ms">
                    <div class="services-two__single">
                        <div class="services-two__imge">
                            <img src="{{asset('assets/img/actualites')}}/{{$photo->picture}}" alt="">
                        </div>
                        <div class="services-two__hover-content">
                            <p class="services-two__hover-sub-title">
                            @if(session('locale') === 'fr')
                            {{$photo->title}}
                            @else
                            {{$photo->title_en}}
                            @endif
                        
                            </p>
                        </div>
                    </div>
                </div>
                <div class="col-xl-4 col-lg-4 wow fadeInUp" data-wow-delay="100ms">
                    <div class="services-two__single">
                        <div class="services-two__imge">
                            <img src="{{asset('assets/img/actualites')}}/{{$photo->picture3}}" alt="">
                        </div>
                        <div class="services-two__hover-content">
                            <p class="services-two__hover-sub-title">
                            @if(session('locale') === 'fr')
                            {{$photo->title}}
                            @else
                            {{$photo->title_en}}
                            @endif
                        </p>
                        </div>
                    </div>
                </div>
                <div class="col-xl-4 col-lg-4 wow fadeInUp" data-wow-delay="100ms">
                    <div class="services-two__single">
                        <div class="services-two__imge">
                            <img src="{{asset('assets/img/actualites')}}/{{$photo->picture4}}" alt="">
                        </div>
                        <div class="services-two__hover-content">
                            <p class="services-two__hover-sub-title">
                            @if(session('locale') === 'fr')
                            {{$photo->title}}
                            @else
                            {{$photo->title_en}}
                            @endif
                            </p>
                        </div>
                    </div>
                </div>
                @if ($photo->picture5!=null && $photo->picture6!=null && $photo->picture7!=null)
                
                <div class="col-xl-4 col-lg-4 wow fadeInUp" data-wow-delay="100ms">
                    <div class="services-two__single">
                        <div class="services-two__imge">
                            <img src="{{asset('assets/img/actualites')}}/{{$photo->picture5}}" alt="">
                        </div>
                        <div class="services-two__hover-content">
                            <p class="services-two__hover-sub-title">
                            @if(session('locale') === 'fr')
                            {{$photo->title}}
                            @else
                            {{$photo->title_en}}
                            @endif
                            </p>
                        </div>
                    </div>
                </div>
                <div class="col-xl-4 col-lg-4 wow fadeInUp" data-wow-delay="100ms">
                    <div class="services-two__single">
                        <div class="services-two__imge">
                            <img src="{{asset('assets/img/actualites')}}/{{$photo->picture6}}" alt="">
                        </div>
                        <div class="services-two__hover-content">
                            <p class="services-two__hover-sub-title">
                            @if(session('locale') === 'fr')
                            {{$photo->title}}
                            @else
                            {{$photo->title_en}}
                            @endif
                            </p>
                        </div>
                    </div>
                </div>
                <div class="col-xl-4 col-lg-4 wow fadeInUp" data-wow-delay="100ms">
                    <div class="services-two__single">
                        <div class="services-two__imge">
                            <img src="{{asset('assets/img/actualites')}}/{{$photo->picture7}}" alt="">
                        </div>
                        <div class="services-two__hover-content">
                            <p class="services-two__hover-sub-title">
                            @if(session('locale') === 'fr')
                            {{$photo->title}}
                            @else
                            {{$photo->title_en}}
                            @endif
                            </p>
                        </div>
                    </div>
                </div>
                @endif
                    
                    @endforeach
                @else
                <h3 class="text-center text-success wow slideInLeft" data-wow-delay="100ms"
                    data-wow-duration="2500ms">{{ __('resultat.photo') }}</h3>
                @endif
            </div>
        </div>
    </section>
    <!--Site Footer Start-->
    @include('components.frontend.footer')
    <!--Site Footer End-->


</div><!-- /.page-wrapper -->

</body>

</html>
