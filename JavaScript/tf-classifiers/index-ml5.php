<?php
require('../../../include/head-php.php');

LogActivity($user, "Viewed Labs > ml5 Classifier", "/connect/analytics/labs/tf-classifiers/index-ml5.php", $ip);

// Have we received Blasting data from this machine yet?
mysqli_select_db($link, 'coldjet_iot') or die('Cannot select the DB');

require('../../../include/common-functions.php');
require('../../../include/common-page-data.php');
require('../../../include/get-strings-by-lang.php');
?>
<!doctype html>
<html>
<head>
    <title><?= $ui_title_connect ?> | Labs | Tensor Flow Image Classifier</title>
    
    <?php require('../../../include/head-customer.php'); ?>
	
	<!-- p5 -->
	<script src="https://cdn.jsdelivr.net/npm/p5@1.0.0/lib/p5.min.js"></script>
    
	<!-- ml5 -->
    <script src="https://unpkg.com/ml5@latest/dist/ml5.min.js"></script>	
	
	<script type='text/javascript'>
	$(document).ready(function() 
	{
		$('.content_cntnr').slideDown();


	});
	</script>
</head>
<body>
    <?php require('../../../include/header.php'); ?>

	<div id='content'>                
        <?php
        if(in_array('Administrator', $auth_roles))
        {
            // Display the Main Menu
            require('../../../include/menu-ecasp-machine.php');
			?>
			<script>
			// Your code will go here
			// open up your console - if everything loaded properly you should see the latest ml5 version
			console.log('ml5 version:', ml5.version);

			function setup() {
				createCanvas(400, 400);
			}

			function draw() {
				background(200);
			}
			</script>
			<?php
        }
         else
            print "<p class='no_auth_msg'>$ui_msg_no_auth_to_view_page</p>";
       ?>
    </div><!-- #content -->
</body>
</html>