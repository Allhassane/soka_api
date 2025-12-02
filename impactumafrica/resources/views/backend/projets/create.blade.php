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
                <li class="breadcrumb-item active">Enregistrement des projets</li>
            </ul>
            <div class="section-body">
                <div class="row">
                    <div class="col-12">
                        <div class="card">
                            <div class="card-header">
                                <h4>Enregistrement des projets</h4>
                            </div>
                            <div class="card-body">
                                <form class="user" method="post" action="{{route('projet.store')}}" enctype="multipart/form-data">
                                    @csrf
                                    <h5 class="text-danger">Information du projet</h5>
                                    <div class="form-group row">
                                        <div class="col-4">
                                            <label for="">Saisir le nom du projet</label>
                                            <input type="text" name="title" class="form-control form-control-user" id="exampleFirstName"
                                                   placeholder="" required>
                                        </div>
                                        <div class="col-4">
                                            <label for="">Choisir l'image de profil(410*260)</label>
                                            <input type="file" name="picture" class="form-control form-control-user" id="exampleFirstName"
                                                   placeholder="" required>
                                        </div>
                                        <div class="col-4">
                                            <label for="">Choisir l'image de detail(image large)</label>
                                            <input type="file" name="picture2" class="form-control form-control-user" id=""
                                                   placeholder="" ><br>
                                        </div>
                                        <div class="col-12">
                                            <label for="">Saisir l'info résumé du projet</label>
                                            <input type="text" name="info" class="form-control form-control-user" id="exampleFirstName"
                                                   placeholder="" required><br>
                                        </div>

                                        <div class="col-4">
                                            <label for="">Saisir le nom du bailleur du projet</label>
                                            <input type="text" name="bailleur" class="form-control form-control-user" id="exampleFirstName"
                                                   placeholder="" required>
                                        </div>
                                        <div class="col-4">
                                            <label for="">Saisir le nom de la zone du projet</label>
                                            <input type="text" name="zone" class="form-control form-control-user" id="exampleFirstName"
                                                   placeholder="" required>
                                        </div>
                                        <div class="col-4">
                                            <label for="">Saisir date debut et fin du projet</label>
                                            <input type="text" name="date_projet" class="form-control form-control-user" id="exampleFirstName"
                                                   placeholder="" required>
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
                                        <button type="submit" class="btn btn-primary btn-user ">Enregistrer le projet</button>
                                        <a href="{{route('projet.list')}}" class="btn btn-danger">Annuler</a>                    </center>
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
