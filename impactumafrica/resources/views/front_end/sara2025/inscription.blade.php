<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title> ONG IMPACTUM | Inscription Visiteur SARA 2025 </title>
    <!-- favicons Icons -->
    <link rel="apple-touch-icon" sizes="180x180" href="{{asset('assets/img/favicons/apple-touch-icon.png')}}" />
    <link rel="icon" type="image/png" sizes="32x32" href="{{asset('assets/img/logo/logo.png')}}" />
    <link rel="manifest" href="{{asset('assets/img/favicons/site.webmanifest')}}" />

    <meta name="author" content="impactumtemplate">
    <meta name="description" content="Inscription des visiteurs au SARA 2025">
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
        <div class="page-header-bg" style="background-image: url({{asset('assets/img/banniere.jpg')}})">
        </div>
        <div class="container">
            <div class="page-header__inner">
                <h2>VISITEURS DU STAND IMPACTUM AU SARA 2025 </h2>
            </div>
        </div>
    </section>

    <section class="contact-two">
        <div class="container">
            <div class="section-title text-center wow slideInDown" data-wow-delay="100ms"
                 data-wow-duration="2500ms">
                <h4 class="section-">Formulaire de presence</h4><br>
                <h5 class="text-danger">Les champs marqués d'une * sont obligatoires</h5><br>
            </div>
            <div class="contact-two__form-box wow slideInUp" data-wow-delay="100ms"
                 data-wow-duration="2500ms">
                <form action="{{route('inscription.store')}}" method="post" class="">
                    @csrf
                    <div class="row">
                        <div class="col-xl-6">
                            <div class="contact-form__input-box">
                                <input type="text" placeholder="Nom et prenom *" name="name" required value="{{old('name')}}">
                            </div>
                        </div>
                        <div class="col-xl-6">
                            <div class="contact-form__input-box">
                                <input type="email" required name="email" placeholder="Adresse Email *" value="{{old('email')}}">
                            </div>
                        </div>
                        <div class="col-xl-6">
                            <div class="contact-form__input-box">
                                <input type="text" placeholder="Contact(s) *" name="contact" value="{{old('contact')}}">
                            </div>
                        </div>
                        <div class="col-xl-6">
                            <div class="contact-form__input-box">
                                <input type="text" placeholder="Entreprise ou Structure" name="entreprise" value="{{old('entreprise')}}">
                            </div>
                        </div>

                        <div class="col-xl-6">
                            <div class="contact-form__input-box">
                                <input type="text" placeholder="Lieu de provenance *" required name="lieu_provenance" value="{{old('lieu_provenance')}}">
                            </div>
                        </div>
                        <div class="col-xl-6">
                            <div class="contact-form__input-box">
                                <input type="text" placeholder="Secteur d'activité" required name="secteur_activite" value="{{old('secteur_activite')}}">
                            </div>
                        </div>

                        <div class="col-xl-12">
                            <div class="contact-form__input-box">
                                <input type="text" placeholder="Site internet"  name="url_site_web" value="{{old('url_site_web')}}">
                            </div>
                        </div>
                    </div>
                    <div class="row">
                        <div class="col-xl-12">
                            <div class="contact-form__btn-box">
                                <button type="submit" class="thm-btn contact-two__btn">S'enregister<i
                                        class="icon-right-arrow"></i> </button>
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
                <iframe src="https://www.google.com/maps/embed?pb=!1m17!1m12!1m3!1d3972.1261930667015!2d-3.9890970250160027!3d5.397736894581314!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m2!1m1!2zNcKwMjMnNTEuOSJOIDPCsDU5JzExLjUiVw!5e0!3m2!1sfr!2sci!4v1735221065807!5m2!1sfr!2sci"  width="100%" height="400" style="border:0;" allowfullscreen="" loading="lazy" referrerpolicy="no-referrer-when-downgrade" loading="lazy" referrerpolicy="IMPACTUM"></iframe>

            </div>
        </div>
    </section>


    <!--Site Footer Start-->
    @include('components.frontend.footer')
    <!--Site Footer End-->


</div><!-- /.page-wrapper -->

</body>

</html>
