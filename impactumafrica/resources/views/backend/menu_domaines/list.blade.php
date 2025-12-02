@extends('layouts.app_admin')

@section('content')
    <div class="container-fluid">

        <!-- Page Heading -->
        <div class="d-sm-flex align-items-center justify-content-between mb-4">
            <h1 class="h3 mb-0 text-gray-800">Liste des domaines d'activités</h1>
            <a href="{{route('domaine.create')}}" class="d-none d-sm-inline-block btn btn-sm btn-primary shadow-sm"><i
                    class="fas fa-plus fa-sm text-white-50"></i> Ajouter un domaine d'activité</a>
        </div>

        <div class="card shadow mb-4">
            <div class="card-header py-3">
                {{--                            <h6 class="m-0 font-weight-bold text-primary">DataTables Example</h6>--}}
            </div>
            <div class="card-body">
                @include('components.admin.message')
                @if($datas->count()>0)
                    <div class="table-responsive">
                        <table class="table table-bordered" id="dataTable" width="100%" cellspacing="0">
                            <thead>
                            <tr>
                                <th>Désignation</th>
                                <th>Image</th>
                                <th>Description</th>
                                <th>Actions</th>
                            </tr>
                            </thead>
                            <tbody>
                            @foreach($datas as $data)
                                <tr>
                                    <td>{{$data->title}}</td>
                                    <td><img src="{{asset('img/domaines')}}/{{$data->picture}}" width="100" height="100" alt=""></td>
                                    <td>{{$data->description}}</td>
                                    <td>
                                        <a href="{{route('domaine.edit',$data->id)}}" class="btn btn-warning btn-sm">Editer</a>
                                        <a href="{{route('domaine.delete',$data->id)}}" class="btn btn-danger btn-sm" >Supprmier</a>
                                    </td>
                                </tr>
                            @endforeach

                            </tbody>
                        </table>
                    </div>
                @else
                    <h6 class="text-center">Aucun domaine d'activité trouvé</h6>
                @endif
            </div>
        </div>

    </div>
@endsection
