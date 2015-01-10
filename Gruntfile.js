module.exports = function (grunt) {
    grunt.loadNpmTasks('grunt-contrib-jshint');

    grunt.initConfig({

        jshint: {
            options: { jshintrc: true },
            all: ['*.js', 'lib/*.js', 'test/*.js']
        }

    });

    grunt.registerTask('default', ['jshint']);
};
