<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title> ONG IMPACTUM | Contact </title>
    <!-- favicons Icons -->
  <link rel="apple-touch-icon" sizes="180x180" href="{{asset('assets/img/favicons/apple-touch-icon.png')}}" />
    <link rel="icon" type="image/png" sizes="32x32" href="{{asset('assets/img/logo/logo.png')}}" />
    <link rel="manifest" href="{{asset('assets/img/favicons/site.webmanifest')}}" />

    <meta name="author" content="impactumtemplate">
    <meta name="description" content="Nous sommes situés à Abidjan Cocody Angré 7è tranche, près de la pharmacie les lauréades.
    Contactez nous aux suivants +225 2722525954 / +225 0758683731 ou par email à l'adresse suivante: contact@impactum.africa">

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
        <div class="page-header-bg" style="background-image: url({{asset('assets/img/contact.jpg')}})">
        </div>
        <div class="container">
            <div class="page-header__inner">
                <h2>{{ __('footer.section3_title') }}</h2>
            </div>
        </div>
    </section>

    <section class="blog-one">
        <div class="container">
            <div class="row">
                <div class="col-xl-3 col-lg-3 col-md-3 wow slideInLeft" data-wow-delay="100ms"
                     data-wow-duration="2500ms">
                    <div class="contact-details__single">
                        <div class="contact-details__icon">
                            <span class="icon-help"></span>
                        </div>
                        <div class="contact-details__text">
                            <p>{{ __('footer.section3_title') }}</p>
                            <h3><a href="tel:+2250758683731">+225 2722525954 <br>+225 0758683731</a></h3>
                        </div>
                    </div>
                </div>
                <div class="col-xl-3 col-lg-3 col-md-3 wow slideInLeft" data-wow-delay="100ms"
                     data-wow-duration="2500ms">
                    <div class="contact-details__single">
                        <div class="contact-details__icon">
                            <span class="icon-mailbox"></span>
                        </div>
                        <div class="contact-details__text">
                            <p>{{ __('footer.email') }}</p>
                            <h3><a href="mailto:contact@impactum.africa">contact@impactum.africa</a></h3>
                        </div>
                    </div>
                </div>
                <div class="col-xl-4 col-lg-4 col-md-4 wow slideInRight" data-wow-delay="100ms"
                     data-wow-duration="2500ms">
                    <div class="contact-details__single contact-details__single-last">
                        <div class="contact-details__icon">
                            <span class="icon-maps-and-flags"></span>
                        </div>
                        <div class="contact-details__text">
                            <p>{{ __('footer.localisation_title') }}</p>
                            <h3>{{ __('menu.info_localisation') }}</h3>
                        </div>
                    </div>
                </div>
                <div class="col-xl-2 col-lg-2 col-md-2 wow slideInRight" data-wow-delay="100ms"
                     data-wow-duration="2500ms">
                    <div class="contact-details__single">
                        <div class="contact-details__social">
                            <a href="https://www.facebook.com/Impactum.africa" target="_blank"><i class="fab fa-facebook"></i></a>
                            <a href="https://www.instagram.com/ong_impactum/" target="_blank"><i class="fab fa-instagram"></i></a>
                            <a href="https://www.linkedin.com/company/ong-impactum/" target="_blank"><i class="fab fa-linkedin"></i></a>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </section>

    <section class="contact-two">
        <div class="container">
            <div class="section-title text-center wow slideInDown" data-wow-delay="100ms"
                 data-wow-duration="2500ms">
                <span class="section-title__tagline">{{ __('contact.form_title') }}</span>
                <h4 class="section-">{{ __('contact.form_description') }}</h4><br>
            </div>
            <div class="contact-two__form-box wow slideInUp" data-wow-delay="100ms"
                 data-wow-duration="2500ms">
                 <form action="{{ route('contact.store') }}" method="post" class="">
    @csrf
    @honeypot   {{-- Champ invisible pour piéger les bots --}}

    <div class="row">
        <!-- Nom -->
        <div class="col-xl-6">
            <div class="contact-form__input-box">
                <input type="text" name="name" placeholder="{{ __('contact.nom') }}" value="{{ old('name') }}" required>
                @error('name')
                    <small class="text-danger">{{ $message }}</small>
                @enderror
            </div>
        </div>


        <!-- Email -->
        <div class="col-xl-6">
            <div class="contact-form__input-box">
                <input type="email" name="email" placeholder="Email" value="{{ old('email') }}" required>
                @error('email')
                    <small class="text-danger">{{ $message }}</small>
                @enderror
            </div>
        </div>

        <!-- Téléphone -->
        <div class="col-xl-6">
            <div class="contact-form__input-box">
                <input type="text" name="phone" placeholder="{{ __('footer.section3_title') }}" value="{{ old('phone') }}" required>
                @error('phone')
                    <small class="text-danger">{{ $message }}</small>
                @enderror
            </div>
        </div>

        <!-- Sujet -->
        <div class="col-xl-6">
            <div class="contact-form__input-box">
                <select name="subject" class="form-control" required>
                    <option value="">{{ __('contact.sujet') }}</option>
                    <option value="{{ __('contact.partenariat') }}">{{ __('contact.partenariat') }}</option>
                    <option value="{{ __('contact.stage') }}">{{ __('contact.stage') }}</option>
                    <option value="{{ __('contact.rdv') }}">{{ __('contact.rdv') }}</option>
                    <option value="{{ __('contact.infos') }}">{{ __('contact.infos') }}</option>
                    <option value="{{ __('contact.autre') }}">{{ __('contact.autre') }}</option>
                </select>
                @error('subject')
                    <small class="text-danger">{{ $message }}</small>
                @enderror
            </div>
        </div>
    </div>

    <!-- Message -->
    <div class="row">
        <div class="col-xl-12">
            <div class="contact-form__input-box text-message-box">
                <textarea name="message" placeholder="{{ __('contact.message') }}" required>{{ old('message') }}</textarea>
                @error('message')
                    <small class="text-danger">{{ $message }}</small>
                @enderror
            </div>

            <!-- Bouton -->
            <div class="contact-form__btn-box">
                <button type="submit" class="thm-btn contact-two__btn">
                    {{ __('contact.bouton') }} <i class="icon-right-arrow"></i>
                </button>
            </div>
        </div>
    </div>
</form>

            </div>
        </div>
    </section>

    <section class="google-map">
        <div class="container">
            <div class="google-map-box">
                <iframe src="https://www.google.com/maps/embed?pb=!1m17!1m12!1m3!1d3972.1261930667015!2d-3.9890970250160027!3d5.397736894581314!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m2!1m1!2zNcKwMjMnNTEuOSJOIDPCsDU5JzExLjUiVw!5e0!3m2!1sfr!2sci!4v1735221065807!5m2!1sfr!2sci"  width="100%" height="400" style="border:0;" allowfullscreen="" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>

            </div>
        </div>
    </section>


    <!--Site Footer Start-->
    @include('components.frontend.footer')
    <!--Site Footer End-->


</div><!-- /.page-wrapper -->

</body>

</html>
