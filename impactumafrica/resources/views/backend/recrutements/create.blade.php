<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta content="width=device-width, initial-scale=1, maximum-scale=1, shrink-to-fit=no" name="viewport">
    <title>ONG IMPACTUM - Admin Template</title>
    <!-- General CSS Files -->
    <link rel="stylesheet" href="{{asset('admin/assets/css/app.min.css')}}">
    <!-- Template CSS -->
    <link rel="stylesheet" href="{{asset('admin/assets/bundles/prism/prism.css')}}">
    <link rel="stylesheet" href="{{asset('admin/assets/css/style.css')}}">
    <link rel="stylesheet" href="{{asset('admin/assets/css/components.css')}}">
    <link rel="stylesheet" href="{{asset('admin/assets/bundles/jqvmap/dist/jqvmap.min.css')}}">
    <!-- Custom style CSS -->
    <link rel="stylesheet" href="{{asset('admin/assets/css/custom.css')}}">
    <link rel='shortcut icon' type='image/x-icon' href='{{asset('front_assets/images/logo.png')}}' />
</head>

<body>
<div class="loader"></div>
<div class="main-wrapper main-wrapper-1">
    <div class="navbar-bg"></div>
    @include('components.admin.admin_topbar')

    @include('components.admin.menu')
    <div class="main-content">
        <section class="section">
            <ul class="breadcrumb breadcrumb-style ">
                <li class="breadcrumb-item">
                    <h4 class="page-title m-b-0">Tableau de bord</h4>
                </li>
                <li class="breadcrumb-item">
                    <a href="{{route('dashboard')}}">
                        <i data-feather="home"></i></a>
                </li>
                <li class="breadcrumb-item active">Enregistrement des recrutements/appel d'offre</li>
            </ul>
            <div class="section-body">
                <div class="row">
                    <div class="col-12">
                        <div class="card">
                            <div class="card-header">
                                <h4>Enregistrement des recrutements</h4>
                            </div>
                            <div class="card-body">
                                  <form class="user" method="post" action="{{route('recrutement.store')}}" enctype="multipart/form-data">
                                    @csrf
                                    <div class="form-group row">
                                        <div class="col-3">
                                            <label for="">Saisir le titre de l'offre</label>
                                            <input type="text" name="title" class="form-control form-control-user" id="exampleFirstName"
                                                   placeholder="" value="{{old('title')}}" required><br>
                                        </div>
                                        <div class="col-3">
                                            <label for="">Choisir la date d'expiration</label>
                                            <input type="date" name="date_expiration" class="form-control form-control-user" id="exampleFirstName"
                                                   placeholder="" value="{{old('date_expiration')}}" required><br>
                                        </div>
                                        <div class="col-3">
                                            <label for="">Lien des TDR</label>
                                            <input type="text" name="link" class="form-control form-control-user" id="exampleFirstName"
                                                   placeholder="" value="{{old('link')}}" >
                                        </div>
                                        <div class="col-3">
                                            <label for="">Joindre le document</label>
                                            <input type="file" name="document" class="form-control form-control-user" id="exampleFirstName"
                                                   placeholder="" value="{{old('document')}}" >
                                        </div>
                                    </div>

                                    <div class="form-group">
                                        <div class="col-sm-12">
                                            <label for="">Saisir la description</label>
                                            <textarea id="description" name="description" class="form-control"
                                                      rows="6" cols="" placeholder="Saisir la description" required>
                                            </textarea>
                                        </div>
                                    </div>
                                    <center>
                                        <button type="submit" class="btn btn-primary btn-user ">Enregistrer un recrutement</button>
                                        <a href="{{route('recrutement.list')}}" class="btn btn-danger" >Annuler</a>
                                    </center>
                                </form>

                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>

    </div>
    <footer class="main-footer">
        <div class="footer-left">
            Copyright &copy; 2024 <div class="bullet"></div> Design By <a href="https://www.seinamistartup.ci" target="_blank">SEINAMI STARTUP</a>
        </div>
        <div class="footer-right">
        </div>
    </footer>
</div>
<!-- General JS Scripts -->
<script src="{{asset('admin/assets/js/app.min.js')}}"></script>
<script src="{{asset('admin/assets/bundles/prism/prism.js')}}"></script>
<!-- JS Libraies -->
<script src="{{asset('admin/assets/bundles/apexcharts/apexcharts.min.js')}}"></script>
<script src="{{asset('admin/assets/bundles/amcharts5/index.js')}}"></script>
<script src="{{asset('admin/assets/bundles/amcharts5/xy.js')}}"></script>
<script src="{{asset('admin/assets/bundles/amcharts5/percent.js')}}"></script>
<script src="{{asset('admin/assets/bundles/amcharts5/radar.js')}}"></script>
<script src="{{asset('admin/assets/bundles/amcharts5/Animated.js')}}"></script>
<!-- Page Specific JS File -->
<script src="{{asset('admin/assets/js/page/index2.js')}}"></script>
<!-- Template JS File -->
<script src="{{asset('admin/assets/js/scripts.js')}}"></script>
<!-- Custom JS File -->
<script src="{{asset('admin/assets/js/custom.js')}}"></script>
<script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
<script src="https://cdn.ckeditor.com/ckeditor5/41.4.2/classic/ckeditor.js"></script>
<script>
    @if (session('success'))

    Swal.fire({
        icon: 'success',
        title: '{{ session('success') }}'
    });
    @endif

    @if (session('error'))

    Swal.fire({
        icon: 'error',
        title: '{{ session('error') }}'
    });
    @endif
</script>
<script>
    ClassicEditor
        .create( document.querySelector( '#description' ) )
        .then( editor => {
            console.log( editor );
        } )
        .catch( error => {
            console.error( error );
        } );
</script>
</body>

</html>
