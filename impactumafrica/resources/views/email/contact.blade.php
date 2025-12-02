<html>
<head>
    <title>Ma première page avec du style</title>
</head>

<body>

<h1>Email provenant du formulaire de contact du site web</h1>

<p><strong>Nom Expéditeur:</strong> {{ $contactData['name'] }}</p>
<p><strong>Email Expéditeur:</strong> {{ $contactData['email'] }}</p>
<p><strong>Contact Expéditeur:</strong> {{ $contactData['phone'] }}</p>
<p><strong>Objet:</strong> {{ $contactData['subject'] }}</p>
<p><strong>Message:</strong></p>
<p>{{ $contactData['message'] }}</p>


</body>
</html>
