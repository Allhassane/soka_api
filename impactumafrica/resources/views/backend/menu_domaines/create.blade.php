@extends('layouts.app_admin')
@section('content')
    <div class="container-fluid">

        <!-- Page Heading -->
        <div class="d-sm-flex align-items-center justify-content-between mb-4">
            <h1 class="h3 mb-0 text-gray-800">Enregistrer un domaine d'activité</h1>
            <a href="{{route('domaine.list')}}" class="d-none d-sm-inline-block btn btn-sm btn-primary shadow-sm"><i
                    class="fas fa-backward fa-sm text-white-50"></i> Retourner sur la liste</a>
        </div>

        <div class="card shadow mb-4">
            <div class="card-header py-3">
            </div>
            <div class="card-body">
                <form class="user" method="post" action="{{route('domaine.store')}}" enctype="multipart/form-data">
                    @csrf
                    <div class="form-group row">
                        <div class="col-sm-4 mb-3 mb-sm-0">
                            <label for="">Saisir le nom de l'activité</label>
                            <input type="text" name="title" class="form-control form-control-user" id="exampleFirstName"
                                   placeholder="Nom complet" required>
                        </div>
                        <div class="col-sm-4 mb-3 mb-sm-0">
                            <label for="">Choisir une image</label>
                            <input type="file" name="picture" class="form-control form-control-user" id="exampleFirstName"
                                   placeholder="Nom complet" required>
                        </div>
                        <div class="col-sm-4 mb-3 mb-sm-0">
                            <label for="">Choix du statut</label>
                            <select name="statut" id="" class="form-control" required>
                                <option value="Long">Long</option>
                                <option value="Court">Court</option>
                            </select>
                        </div>
                    </div>
                    <div class="form-group row">
                        <div class="col-sm-12">
                            <label for="">Saisir la description de l'activité</label>
                            <textarea name="description" required id="" cols="30" class="form-control " rows="4"></textarea>
                        </div>
                    </div>
                    <center>
                        <button type="submit" class="btn btn-primary btn-user ">Enregistrer un domaine d'activité</button>
                        <a href="{{route('domaine.list')}}" class="btn btn-danger btn-user ">Annuler</a>
                    </center>
                </form>
            </div>
        </div>

    </div>
@endsection
