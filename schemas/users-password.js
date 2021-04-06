NEWSCHEMA('Users/Password', function(schema) {

	schema.define('name', 'String(120)', true);

	ON('configure', function() {
		CONF.default_language && schema.setResource(CONF.default_language);
	});

	schema.addWorkflow('exec', function($, model) {

		if (CONF.allowpassword === false) {
			$.invalid('error-permissions');
			return;
		}

		var response = REPO.users.findItem('login', model.name);
		if (response) {

			if (response.blocked) {
				$.invalid('error-blocked');
				return;
			} else if (response.inactive) {
				$.invalid('error-inactive');
				return;
			}

			var model = {};
			model.firstname = response.firstname;
			model.lastname = response.lastname;
			model.middlename = response.middlename;
			model.name = response.name;
			model.login = model.name;
			model.token = ENCRYPT({ id: response.id, date: NOW, type: 'password' }, CONF.secretpassword);
			model.email = response.email;

			EMIT('users/password', response.id);
			MAIL(model.email, '@(Password recovery)', '/mails/password', model, response.language);
			DBMS().log($, model, response.name);
			$.success();

		} else
			$.invalid('error-credentials');
	});

});